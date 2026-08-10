-- ============================================================================
-- Faculty borrow for three months; students for a fortnight.
--
-- The loan period was one figure for everyone. It now depends on who is
-- borrowing: 15 days for a student, 90 for faculty. A student's copy has to
-- circulate among a cohort that needs it; a faculty member keeps a reference
-- text for the length of a course.
--
-- Two columns rather than a lookup table, mirroring max_books_student /
-- max_books_staff. member_type is a two-value enum, so a two-row table would
-- be indirection with nothing to show for it.
--
-- Fines are deliberately unchanged: a faculty loan accrues the same Rs 1/day
-- once its 90 days are up. Only the runway differs, not the penalty.
--
-- Nothing already issued moves. Every loan snapshots loan_period_days_at_issue
-- when it is created, so changing either figure only affects future loans.
--
-- The two functions below are reproduced VERBATIM from their live definitions
-- (pg_get_functiondef), with only the period selection changed. Migrations are
-- append-only, so they are re-created here rather than edited in place.
-- ============================================================================

alter table public.settings
  add column loan_period_days_staff integer not null default 90;

alter table public.settings
  add constraint settings_loan_period_staff
  check (loan_period_days_staff between 1 and 365);

comment on column public.settings.loan_period_days is
  'Loan period in days for STUDENT members. Faculty use loan_period_days_staff.';
comment on column public.settings.loan_period_days_staff is
  'Loan period in days for FACULTY (member_type = staff). Defaults to 90, about
   three months. Chosen in issue_book() and renew_loan(), never in the UI.';

-- ---------------------------------------------------------------------------
-- issue_book(): pick the period from the borrower's member_type, exactly as
-- the borrowing limit directly above it already does.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.issue_book(p_accession_number text, p_member_id uuid)
 RETURNS TABLE(loan_id uuid, book_title text, member_name text, due_date date, loans_out integer, max_loans integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor    uuid := public.assert_librarian();
  v_copy     public.book_copies%rowtype;
  v_member   public.profiles%rowtype;
  v_settings public.settings%rowtype;
  v_max      integer;
  v_count    integer;
  v_due      date;
  v_period   integer;
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
  v_period := case v_member.member_type
                when 'staff' then v_settings.loan_period_days_staff
                else v_settings.loan_period_days
              end;

  v_due := public.today_ist() + v_period;

  begin
    insert into public.loans (
      copy_id, book_id, member_id, issued_by, due_date,
      loan_period_days_at_issue, fine_per_day_at_issue
    )
    values (
      v_copy.id, v_copy.book_id, p_member_id, v_actor, v_due,
      v_period, v_settings.fine_per_day
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
$function$
;

-- ---------------------------------------------------------------------------
-- renew_loan(): same rule. The renewing librarian is not the borrower, so the
-- member_type comes from the loan's member rather than the caller.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.renew_loan(p_loan_id uuid)
 RETURNS TABLE(loan_id uuid, book_title text, member_name text, due_date date, renewal_count integer, max_renewals integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor    uuid := public.assert_librarian();
  v_loan     public.loans%rowtype;
  v_settings public.settings%rowtype;
  v_fine     public.fines%rowtype;
  v_owed     numeric;
  v_due      date;
  v_period   integer;
  v_member_type public.member_type;
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

  -- THE PAY-BEFORE-RENEW RULE.
  select * into v_fine
    from public.fines f
   where f.loan_id = p_loan_id and f.fine_type = 'overdue';

  if found and not v_fine.is_paid and not v_fine.is_waived then
    raise exception 'There is an unpaid fine of Rs %. Collect or waive it before renewing.',
      trim(to_char(coalesce(v_fine.amount, 0), 'FM999999990.00'));
  end if;

  -- Overdue with no fine row yet. Report the amount WITHOUT writing it —
  -- the caller runs assess_overdue_fine() first, in its own transaction.
  if not found and v_loan.due_date < public.today_ist() then
    v_owed := public.calculate_fine(v_loan.due_date, null, v_loan.fine_per_day_at_issue,
                                    public.today_ist());
    if v_owed > 0 then
      raise exception 'This book is overdue with a fine of Rs %. Collect or waive it before renewing.',
        trim(to_char(v_owed, 'FM999999990.00'));
    end if;
  end if;

  select p.member_type into v_member_type
    from public.profiles p where p.id = v_loan.member_id;

  v_period := case v_member_type
                when 'staff' then v_settings.loan_period_days_staff
                else v_settings.loan_period_days
              end;

  v_due := public.today_ist() + v_period;

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
$function$
;

-- create or replace preserves grants, but restate the intended end state so it
-- is visible here rather than inferred from 20260810130000.
revoke execute on function public.issue_book(text, uuid) from public, anon;
grant  execute on function public.issue_book(text, uuid) to authenticated;
revoke execute on function public.renew_loan(uuid) from public, anon;
grant  execute on function public.renew_loan(uuid) to authenticated;
