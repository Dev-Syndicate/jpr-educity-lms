-- ============================================================================
-- Fix: "column reference "loan_id" is ambiguous"
--
-- return_book, renew_loan and pay_fine declare OUT parameters whose names
-- collide with real column names (loan_id, fine_id, member_id...). Inside the
-- function body, `where loan_id = ...` is ambiguous — Postgres cannot tell the
-- output parameter from the table column — and the query fails at runtime.
--
-- It surfaced as renew_loan appearing to "block" a renewal for the right
-- reason while actually erroring for the wrong one, and never writing the
-- fine row it was supposed to assess.
--
-- Fix: qualify every column reference with its table alias. The OUT parameter
-- names stay as they are, because the app reads them by name.
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
  select * into v_settings from public.settings s where s.id = 1;
  select * into v_loan from public.loans l where l.id = p_loan_id for update;

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

  -- THE PAY-BEFORE-RENEW RULE. Renewal moves the due date to today + loan
  -- period; without this, days already owed would silently vanish.
  select * into v_fine
    from public.fines f
   where f.loan_id = p_loan_id
     and f.fine_type = 'overdue';

  if found and not v_fine.is_paid and not v_fine.is_waived then
    raise exception 'There is an unpaid fine of Rs %. Collect or waive it before renewing.',
      trim(to_char(coalesce(v_fine.amount, 0), 'FM999999990.00'));
  end if;

  -- No fine row yet but already late: assess it now, then refuse until settled.
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

  update public.loans l
     set due_date        = v_due,
         renewal_count   = l.renewal_count + 1,
         last_renewed_at = now(),
         last_renewed_by = v_actor
   where l.id = p_loan_id;

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

-- ---------------------------------------------------------------------------

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
  select * into v_loan from public.loans l where l.id = p_loan_id for update;

  if not found then
    raise exception 'That loan no longer exists.';
  end if;

  if v_loan.returned_at is not null then
    raise exception 'This book was already returned.';
  end if;

  update public.loans l
     set returned_at = v_now,
         returned_to = v_actor
   where l.id = p_loan_id;

  v_late := greatest(0, (v_now at time zone 'Asia/Kolkata')::date - v_loan.due_date);
  v_fine := public.calculate_fine(v_loan.due_date, v_now, v_loan.fine_per_day_at_issue,
                                  public.today_ist());

  -- Freeze the amount. Update only while unsettled: overwriting a paid or
  -- waived fine would destroy the payment record.
  if v_fine > 0 then
    update public.fines f
       set amount      = v_fine,
           assessed_at = v_now
     where f.loan_id = p_loan_id
       and f.fine_type = 'overdue'
       and not f.is_paid
       and not f.is_waived
    returning f.id into v_fine_id;

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

-- ---------------------------------------------------------------------------

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
  select * into v_fine from public.fines f where f.id = p_fine_id for update;

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

  update public.fines f
     set is_paid      = true,
         paid_amount  = v_fine.amount,   -- full payment only
         paid_at      = now(),
         collected_by = v_actor,
         payment_note = p_note
   where f.id = p_fine_id;

  select p.full_name into v_member from public.profiles p where p.id = v_fine.member_id;

  insert into public.loan_events (loan_id, member_id, event_type, actor_id, details)
  values (v_fine.loan_id, v_fine.member_id, 'fine_paid', v_actor,
          jsonb_build_object('amount', v_fine.amount, 'fine_id', p_fine_id));

  return query select p_fine_id, v_member, v_fine.amount;
end;
$$;

-- ---------------------------------------------------------------------------

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

  select * into v_fine from public.fines f where f.id = p_fine_id for update;

  if not found then
    raise exception 'That fine no longer exists.';
  end if;

  if v_fine.is_paid then
    raise exception 'This fine has already been paid and cannot be waived.';
  end if;

  if v_fine.is_waived then
    raise exception 'This fine has already been waived.';
  end if;

  -- Computed from the loans table, not v_loans_with_fine: that view is
  -- security_invoker, so reading it here would apply the caller's RLS.
  if v_fine.assessed_at is null then
    select public.calculate_fine(l.due_date, l.returned_at, l.fine_per_day_at_issue,
                                 public.today_ist())
      into v_amount
      from public.loans l
     where l.id = v_fine.loan_id;

    update public.fines f
       set amount      = coalesce(f.amount, v_amount, 0),
           assessed_at = now()
     where f.id = p_fine_id;

    select * into v_fine from public.fines f where f.id = p_fine_id;
  end if;

  update public.fines f
     set is_waived     = true,
         waived_at     = now(),
         waived_by     = v_actor,
         waiver_reason = btrim(p_reason)
   where f.id = p_fine_id;

  select p.full_name into v_member from public.profiles p where p.id = v_fine.member_id;

  insert into public.loan_events (loan_id, member_id, event_type, actor_id, details)
  values (v_fine.loan_id, v_fine.member_id, 'fine_waived', v_actor,
          jsonb_build_object('amount', v_fine.amount, 'reason', btrim(p_reason)));

  return query select p_fine_id, v_member, v_fine.amount;
end;
$$;
