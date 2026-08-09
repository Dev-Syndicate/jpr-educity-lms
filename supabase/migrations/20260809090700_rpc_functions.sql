-- ============================================================================
-- Business logic as SECURITY DEFINER functions.
--
-- Every rule lives here rather than in the application, so it holds no matter
-- how the database is reached. Each function re-checks that the caller is a
-- librarian: a page-level check does not extend to these.
--
-- Exception messages are shown VERBATIM to the librarian at the counter, so
-- they are written as sentences a person can act on.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Internal: assert the caller is a librarian.
-- ---------------------------------------------------------------------------
create or replace function public.assert_librarian()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid := auth.uid();
begin
  if v_id is null then
    raise exception 'You must be signed in to do this.';
  end if;

  if not public.is_librarian() then
    raise exception 'Only a librarian can do this.';
  end if;

  return v_id;
end;
$$;

-- ============================================================================
-- issue_book — the counter's main action.
-- ============================================================================

create or replace function public.issue_book(
  p_accession_number text,
  p_member_id        uuid
)
returns table (
  loan_id     uuid,
  book_title  text,
  member_name text,
  due_date    date,
  loans_out   integer,
  max_loans   integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid := public.assert_librarian();
  v_copy     public.book_copies%rowtype;
  v_member   public.profiles%rowtype;
  v_settings public.settings%rowtype;
  v_max      integer;
  v_count    integer;
  v_due      date;
  v_loan_id  uuid;
  v_title    text;
begin
  select * into v_settings from public.settings where id = 1;

  -- Copy ---------------------------------------------------------------
  select * into v_copy
    from public.book_copies
   where accession_number = upper(btrim(p_accession_number));

  if not found then
    raise exception 'No copy with accession number %. Check the barcode.',
      upper(btrim(p_accession_number));
  end if;

  if v_copy.status = 'lost' then
    raise exception 'Copy % is marked lost and cannot be issued.', v_copy.accession_number;
  elsif v_copy.status = 'damaged' then
    raise exception 'Copy % is marked damaged and cannot be issued.', v_copy.accession_number;
  end if;

  -- Member -------------------------------------------------------------
  select * into v_member from public.profiles where id = p_member_id;

  if not found then
    raise exception 'That member no longer exists.';
  end if;

  if v_member.role <> 'member' then
    raise exception '% is a librarian account, not a borrower.', v_member.full_name;
  end if;

  if v_member.account_status = 'pending' then
    raise exception '% is awaiting approval. Approve the account before issuing.',
      v_member.full_name;
  elsif v_member.account_status = 'rejected' then
    raise exception '%''s registration was rejected and cannot borrow.', v_member.full_name;
  end if;

  if not v_member.is_active then
    raise exception '%''s account is deactivated and cannot borrow.', v_member.full_name;
  end if;

  -- Borrowing limit ----------------------------------------------------
  v_max := case v_member.member_type
             when 'staff' then v_settings.max_books_staff
             else v_settings.max_books_student
           end;

  v_count := public.member_active_loan_count(p_member_id);

  if v_count >= v_max then
    raise exception '% already has % book(s) issued, which is the limit for %.',
      v_member.full_name, v_count, v_member.member_type;
  end if;

  -- Issue --------------------------------------------------------------
  v_due := public.today_ist() + v_settings.loan_period_days;

  begin
    insert into public.loans (
      copy_id, book_id, member_id, issued_by, due_date,
      loan_period_days_at_issue, fine_per_day_at_issue
    )
    values (
      v_copy.id, v_copy.book_id, p_member_id, v_actor, v_due,
      v_settings.loan_period_days, v_settings.fine_per_day
    )
    returning id into v_loan_id;
  exception
    when unique_violation then
      -- loans_one_active_per_copy fired: another scan won the race.
      raise exception 'Copy % is already issued to someone else.', v_copy.accession_number;
  end;

  select b.title into v_title from public.books b where b.id = v_copy.book_id;

  insert into public.loan_events (loan_id, copy_id, member_id, event_type, actor_id, details)
  values (v_loan_id, v_copy.id, p_member_id, 'issued', v_actor,
          jsonb_build_object('due_date', v_due, 'accession_number', v_copy.accession_number));

  return query
    select v_loan_id, v_title, v_member.full_name, v_due, v_count + 1, v_max;
end;
$$;

-- ============================================================================
-- return_book — closes the loan and FREEZES the fine.
-- ============================================================================

create or replace function public.return_book(p_loan_id uuid)
returns table (
  loan_id      uuid,
  book_title   text,
  member_name  text,
  days_late    integer,
  fine_amount  numeric,
  fine_id      uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid := public.assert_librarian();
  v_loan    public.loans%rowtype;
  v_title   text;
  v_member  text;
  v_late    integer;
  v_fine    numeric;
  v_fine_id uuid;
  v_now     timestamptz := now();
begin
  select * into v_loan from public.loans where id = p_loan_id for update;

  if not found then
    raise exception 'That loan no longer exists.';
  end if;

  if v_loan.returned_at is not null then
    raise exception 'This book was already returned.';
  end if;

  update public.loans
     set returned_at = v_now,
         returned_to = v_actor
   where id = p_loan_id;

  v_late := greatest(0, (v_now at time zone 'Asia/Kolkata')::date - v_loan.due_date);
  v_fine := public.calculate_fine(v_loan.due_date, v_now, v_loan.fine_per_day_at_issue,
                                  public.today_ist());

  -- Freeze the amount. Once assessed_at is set, the live view stops
  -- recomputing, so a later change to the fine rate cannot re-price it.
  --
  -- A fine row may already exist (assessed at a refused renewal). Update it
  -- only while it is unsettled — overwriting a paid or waived fine would
  -- destroy the payment record.
  if v_fine > 0 then
    update public.fines
       set amount      = v_fine,
           assessed_at = v_now
     where loan_id = p_loan_id
       and fine_type = 'overdue'
       and not is_paid
       and not is_waived
    returning id into v_fine_id;

    if v_fine_id is null then
      insert into public.fines (loan_id, member_id, fine_type, amount, assessed_at)
      values (p_loan_id, v_loan.member_id, 'overdue', v_fine, v_now)
      on conflict (loan_id) where fine_type = 'overdue' do nothing
      returning id into v_fine_id;
    end if;

    insert into public.loan_events (loan_id, copy_id, member_id, event_type, actor_id, details)
    values (p_loan_id, v_loan.copy_id, v_loan.member_id, 'fine_assessed', v_actor,
            jsonb_build_object('amount', v_fine, 'days_late', v_late));
  end if;

  select b.title into v_title from public.books b where b.id = v_loan.book_id;
  select p.full_name into v_member from public.profiles p where p.id = v_loan.member_id;

  insert into public.loan_events (loan_id, copy_id, member_id, event_type, actor_id, details)
  values (p_loan_id, v_loan.copy_id, v_loan.member_id, 'returned', v_actor,
          jsonb_build_object('days_late', v_late, 'fine', v_fine));

  return query select p_loan_id, v_title, v_member, v_late, v_fine, v_fine_id;
end;
$$;

-- ============================================================================
-- renew_loan — blocked while an unpaid fine exists on this loan.
-- ============================================================================

create or replace function public.renew_loan(p_loan_id uuid)
returns table (
  loan_id       uuid,
  book_title    text,
  member_name   text,
  due_date      date,
  renewal_count integer,
  max_renewals  integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid := public.assert_librarian();
  v_loan     public.loans%rowtype;
  v_settings public.settings%rowtype;
  v_fine     public.fines%rowtype;
  v_owed     numeric;
  v_due      date;
  v_title    text;
  v_member   text;
begin
  select * into v_settings from public.settings where id = 1;
  select * into v_loan from public.loans where id = p_loan_id for update;

  if not found then
    raise exception 'That loan no longer exists.';
  end if;

  if v_loan.returned_at is not null then
    raise exception 'This book has already been returned and cannot be renewed.';
  end if;

  if v_loan.renewal_count >= v_settings.max_renewals then
    raise exception 'This book has already been renewed % time(s), which is the limit. It must be returned.',
      v_loan.renewal_count;
  end if;

  -- THE PAY-BEFORE-RENEW RULE.
  -- Renewal moves the due date to today + loan period. If an overdue book
  -- could be renewed freely, the days already owed would silently vanish.
  select * into v_fine
    from public.fines
   where loan_id = p_loan_id and fine_type = 'overdue';

  if found and not v_fine.is_paid and not v_fine.is_waived then
    raise exception 'There is an unpaid fine of Rs %. Collect or waive it before renewing.',
      trim(to_char(coalesce(v_fine.amount, 0), 'FM999999990.00'));
  end if;

  -- No fine row yet but the book is already late: assess it now so the amount
  -- is captured, and refuse the renewal until it is settled.
  if not found and v_loan.due_date < public.today_ist() then
    v_owed := public.calculate_fine(v_loan.due_date, null, v_loan.fine_per_day_at_issue,
                                    public.today_ist());
    if v_owed > 0 then
      insert into public.fines (loan_id, member_id, fine_type, amount, assessed_at)
      values (p_loan_id, v_loan.member_id, 'overdue', v_owed, now());

      insert into public.loan_events (loan_id, copy_id, member_id, event_type, actor_id, details)
      values (p_loan_id, v_loan.copy_id, v_loan.member_id, 'fine_assessed', v_actor,
              jsonb_build_object('amount', v_owed, 'reason', 'assessed at renewal attempt'));

      raise exception 'This book is overdue with a fine of Rs %. Collect or waive it before renewing.',
        trim(to_char(v_owed, 'FM999999990.00'));
    end if;
  end if;

  v_due := public.today_ist() + v_settings.loan_period_days;

  update public.loans
     set due_date        = v_due,
         renewal_count   = renewal_count + 1,
         last_renewed_at = now(),
         last_renewed_by = v_actor
   where id = p_loan_id;

  select b.title into v_title from public.books b where b.id = v_loan.book_id;
  select p.full_name into v_member from public.profiles p where p.id = v_loan.member_id;

  insert into public.loan_events (loan_id, copy_id, member_id, event_type, actor_id, details)
  values (p_loan_id, v_loan.copy_id, v_loan.member_id, 'renewed', v_actor,
          jsonb_build_object('new_due_date', v_due, 'renewal_count', v_loan.renewal_count + 1));

  return query
    select p_loan_id, v_title, v_member, v_due,
           v_loan.renewal_count + 1, v_settings.max_renewals;
end;
$$;

-- ============================================================================
-- pay_fine — full payment only.
-- ============================================================================

create or replace function public.pay_fine(
  p_fine_id uuid,
  p_note    text default null
)
returns table (
  fine_id     uuid,
  member_name text,
  amount_paid numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := public.assert_librarian();
  v_fine   public.fines%rowtype;
  v_member text;
begin
  select * into v_fine from public.fines where id = p_fine_id for update;

  if not found then
    raise exception 'That fine no longer exists.';
  end if;

  if v_fine.is_paid then
    raise exception 'This fine has already been paid.';
  end if;

  if v_fine.is_waived then
    raise exception 'This fine was waived and cannot be collected.';
  end if;

  if v_fine.assessed_at is null or v_fine.amount is null then
    raise exception 'This fine is still accruing. Return the book first.';
  end if;

  update public.fines
     set is_paid      = true,
         paid_amount  = v_fine.amount,   -- full payment only
         paid_at      = now(),
         collected_by = v_actor,
         payment_note = p_note
   where id = p_fine_id;

  select p.full_name into v_member from public.profiles p where p.id = v_fine.member_id;

  insert into public.loan_events (loan_id, member_id, event_type, actor_id, details)
  values (v_fine.loan_id, v_fine.member_id, 'fine_paid', v_actor,
          jsonb_build_object('amount', v_fine.amount, 'fine_id', p_fine_id));

  return query select p_fine_id, v_member, v_fine.amount;
end;
$$;

-- ============================================================================
-- waive_fine — a reason is REQUIRED.
-- ============================================================================

create or replace function public.waive_fine(
  p_fine_id uuid,
  p_reason  text
)
returns table (
  fine_id       uuid,
  member_name   text,
  amount_waived numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := public.assert_librarian();
  v_fine   public.fines%rowtype;
  v_member text;
  v_amount numeric;
begin
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'A reason is required to waive a fine.';
  end if;

  select * into v_fine from public.fines where id = p_fine_id for update;

  if not found then
    raise exception 'That fine no longer exists.';
  end if;

  if v_fine.is_paid then
    raise exception 'This fine has already been paid and cannot be waived.';
  end if;

  if v_fine.is_waived then
    raise exception 'This fine has already been waived.';
  end if;

  -- A fine can be waived while still accruing (e.g. a lost book written off),
  -- so freeze the amount now if it has not been assessed yet.
  --
  -- Computed from the loans table directly, NOT from v_loans_with_fine: that
  -- view is security_invoker, so reading it here would apply the caller's RLS
  -- and could silently return no row.
  if v_fine.assessed_at is null then
    select public.calculate_fine(l.due_date, l.returned_at, l.fine_per_day_at_issue,
                                 public.today_ist())
      into v_amount
      from public.loans l
     where l.id = v_fine.loan_id;

    update public.fines
       set amount      = coalesce(amount, v_amount, 0),
           assessed_at = now()
     where id = p_fine_id;

    select * into v_fine from public.fines where id = p_fine_id;
  end if;

  update public.fines
     set is_waived     = true,
         waived_at     = now(),
         waived_by     = v_actor,
         waiver_reason = btrim(p_reason)
   where id = p_fine_id;

  select p.full_name into v_member from public.profiles p where p.id = v_fine.member_id;

  insert into public.loan_events (loan_id, member_id, event_type, actor_id, details)
  values (v_fine.loan_id, v_fine.member_id, 'fine_waived', v_actor,
          jsonb_build_object('amount', v_fine.amount, 'reason', btrim(p_reason)));

  return query select p_fine_id, v_member, v_fine.amount;
end;
$$;

-- ============================================================================
-- mark_copy_lost — closes the loan so the fine stops growing forever.
-- ============================================================================

create or replace function public.mark_copy_lost(
  p_accession_number text,
  p_note             text default null
)
returns table (
  copy_id     uuid,
  book_title  text,
  closed_loan uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := public.assert_librarian();
  v_copy  public.book_copies%rowtype;
  v_loan  public.loans%rowtype;
  v_fine  numeric;
  v_title text;
begin
  select * into v_copy
    from public.book_copies
   where accession_number = upper(btrim(p_accession_number));

  if not found then
    raise exception 'No copy with accession number %.', upper(btrim(p_accession_number));
  end if;

  select * into v_loan
    from public.loans
   where copy_id = v_copy.id and returned_at is null
   for update;

  if found then
    v_fine := public.calculate_fine(v_loan.due_date, now(), v_loan.fine_per_day_at_issue,
                                    public.today_ist());

    update public.loans
       set returned_at   = now(),
           returned_to   = v_actor,
           closed_reason = 'lost'
     where id = v_loan.id;

    if v_fine > 0 then
      update public.fines
         set amount = v_fine, assessed_at = now()
       where loan_id = v_loan.id
         and fine_type = 'overdue'
         and not is_paid
         and not is_waived;

      if not found then
        insert into public.fines (loan_id, member_id, fine_type, amount, assessed_at)
        values (v_loan.id, v_loan.member_id, 'overdue', v_fine, now())
        on conflict (loan_id) where fine_type = 'overdue' do nothing;
      end if;
    end if;
  end if;

  update public.book_copies
     set status  = 'lost',
         remarks = coalesce(p_note, remarks)
   where id = v_copy.id;

  select b.title into v_title from public.books b where b.id = v_copy.book_id;

  insert into public.loan_events (loan_id, copy_id, member_id, event_type, actor_id, details)
  values (v_loan.id, v_copy.id, v_loan.member_id, 'marked_lost', v_actor,
          jsonb_build_object('accession_number', v_copy.accession_number, 'note', p_note));

  return query select v_copy.id, v_title, v_loan.id;
end;
$$;

-- ============================================================================
-- register_member — THE ONLY FUNCTION AN ANONYMOUS CALLER CAN REACH.
--
-- This is where hostile input arrives, so:
--   * the registration toggle is checked HERE, not in the UI
--   * role and account_status are hard-coded, never taken from the caller
--   * the declared member type is stored as a CLAIM, verified at approval
--
-- Called immediately after auth.signUp() creates the auth user; the profile
-- row already exists (handle_new_user), so this fills in the real values.
-- ============================================================================

create or replace function public.register_member(
  p_user_id              uuid,
  p_full_name            text,
  p_roll_number          text,
  p_department           text,
  p_declared_member_type public.member_type,
  p_phone                text default null
)
returns table (profile_id uuid, status public.account_status)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_open  boolean;
  v_email text;
begin
  select public_registration into v_open from public.settings where id = 1;

  if not coalesce(v_open, false) then
    raise exception 'Registration is closed. Please visit the library counter.';
  end if;

  if p_full_name is null or length(btrim(p_full_name)) = 0 then
    raise exception 'Please enter your full name.';
  end if;

  if p_roll_number is null or length(btrim(p_roll_number)) = 0 then
    raise exception 'Please enter your roll number or staff ID.';
  end if;

  if exists (
    select 1 from public.profiles
     where lower(roll_number) = lower(btrim(p_roll_number))
       and id <> p_user_id
  ) then
    raise exception 'That roll number is already registered. Please visit the counter.';
  end if;

  select email into v_email from auth.users where id = p_user_id;

  update public.profiles
     set full_name            = btrim(p_full_name),
         roll_number          = btrim(p_roll_number),
         department           = nullif(btrim(p_department), ''),
         phone                = nullif(btrim(p_phone), ''),
         declared_member_type = p_declared_member_type,
         -- Provisional until a librarian verifies the claim at the counter.
         member_type          = p_declared_member_type,
         -- HARD-CODED. Never taken from the caller.
         role                 = 'member',
         account_status       = 'pending',
         email                = coalesce(v_email, email)
   where id = p_user_id;

  if not found then
    raise exception 'Could not complete registration. Please try again.';
  end if;

  insert into public.loan_events (member_id, event_type, details)
  values (p_user_id, 'member_registered',
          jsonb_build_object('declared_member_type', p_declared_member_type,
                             'roll_number', btrim(p_roll_number)));

  return query select p_user_id, 'pending'::public.account_status;
end;
$$;

-- ============================================================================
-- approve_member — run at the counter. Accepts corrections to what was
-- declared, because a false "staff" claim would grant 5 books instead of 3.
-- ============================================================================

create or replace function public.approve_member(
  p_profile_id  uuid,
  p_member_type public.member_type default null,
  p_roll_number text default null,
  p_department  text default null
)
returns table (profile_id uuid, member_name text, member_type public.member_type)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid := public.assert_librarian();
  v_profile public.profiles%rowtype;
  v_type    public.member_type;
begin
  select * into v_profile from public.profiles where id = p_profile_id for update;

  if not found then
    raise exception 'That registration no longer exists.';
  end if;

  if v_profile.account_status = 'active' then
    raise exception '% is already approved.', v_profile.full_name;
  end if;

  v_type := coalesce(p_member_type, v_profile.member_type, v_profile.declared_member_type, 'student');

  update public.profiles
     set account_status   = 'active',
         member_type      = v_type,
         roll_number      = coalesce(nullif(btrim(p_roll_number), ''), roll_number),
         department       = coalesce(nullif(btrim(p_department), ''), department),
         is_active        = true,
         approved_by      = v_actor,
         approved_at      = now(),
         rejected_by      = null,
         rejected_at      = null,
         rejection_reason = null
   where id = p_profile_id;

  insert into public.loan_events (member_id, event_type, actor_id, details)
  values (p_profile_id, 'member_approved', v_actor,
          jsonb_build_object('member_type', v_type,
                             'declared_member_type', v_profile.declared_member_type,
                             'corrected', v_type is distinct from v_profile.declared_member_type));

  return query select p_profile_id, v_profile.full_name, v_type;
end;
$$;

-- ============================================================================
-- reject_member — kept on record, not deleted, so the email stays claimed.
-- ============================================================================

create or replace function public.reject_member(
  p_profile_id uuid,
  p_reason     text default null
)
returns table (profile_id uuid, member_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid := public.assert_librarian();
  v_profile public.profiles%rowtype;
begin
  select * into v_profile from public.profiles where id = p_profile_id for update;

  if not found then
    raise exception 'That registration no longer exists.';
  end if;

  if v_profile.role = 'librarian' then
    raise exception 'Librarian accounts cannot be rejected.';
  end if;

  if public.member_active_loan_count(p_profile_id) > 0 then
    raise exception '% still has books issued. Collect them before rejecting.',
      v_profile.full_name;
  end if;

  update public.profiles
     set account_status   = 'rejected',
         is_active        = false,
         rejected_by      = v_actor,
         rejected_at      = now(),
         rejection_reason = nullif(btrim(p_reason), '')
   where id = p_profile_id;

  insert into public.loan_events (member_id, event_type, actor_id, details)
  values (p_profile_id, 'member_rejected', v_actor,
          jsonb_build_object('reason', p_reason));

  return query select p_profile_id, v_profile.full_name;
end;
$$;

-- ============================================================================
-- approve_and_issue — the counter's one-click path for a pending member.
--
-- ONE TRANSACTION: if the issue fails (copy already out, limit reached), the
-- approval rolls back too, rather than leaving a half-processed member.
-- ============================================================================

create or replace function public.approve_and_issue(
  p_profile_id       uuid,
  p_accession_number text,
  p_member_type      public.member_type default null
)
returns table (
  loan_id     uuid,
  book_title  text,
  member_name text,
  due_date    date,
  loans_out   integer,
  max_loans   integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_librarian();
  perform public.approve_member(p_profile_id, p_member_type);

  return query
    select * from public.issue_book(p_accession_number, p_profile_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Execute grants. Only register_member is reachable anonymously.
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema public from anon, authenticated;

grant execute on function
  public.today_ist(),
  public.is_librarian(),
  public.is_approved_user(),
  public.calculate_fine(date, timestamptz, numeric, date),
  public.member_active_loan_count(uuid),
  public.member_unpaid_fine_total(uuid),
  public.next_accession_number(),
  public.issue_book(text, uuid),
  public.return_book(uuid),
  public.renew_loan(uuid),
  public.pay_fine(uuid, text),
  public.waive_fine(uuid, text),
  public.mark_copy_lost(text, text),
  public.approve_member(uuid, public.member_type, text, text),
  public.reject_member(uuid, text),
  public.approve_and_issue(uuid, text, public.member_type)
  to authenticated;

grant execute on function
  public.register_member(uuid, text, text, text, public.member_type, text)
  to anon, authenticated;
