-- ============================================================================
-- Fix: the fine assessed during a refused renewal was rolled back.
--
-- renew_loan inserted a fines row for an overdue book and then raised an
-- exception to refuse the renewal. But raising rolls back the whole
-- transaction, including that insert — so the librarian was told "collect
-- Rs 5 first" while no fine row existed to collect, leaving them stuck.
--
-- Fix: assess the fine in a separate function the caller invokes first, so the
-- row is committed before any refusal. renew_loan now only READS the fine
-- state and never writes before raising.
-- ============================================================================

-- Assess (freeze) the overdue fine for a loan, if one is owed and not already
-- assessed. Idempotent, and safe to call before any renewal attempt.
create or replace function public.assess_overdue_fine(p_loan_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := public.assert_librarian();
  v_loan  public.loans%rowtype;
  v_owed  numeric;
  v_id    uuid;
begin
  select * into v_loan from public.loans l where l.id = p_loan_id for update;
  if not found then
    raise exception 'That loan no longer exists.';
  end if;

  -- Already has a fine row: nothing to do.
  select f.id into v_id
    from public.fines f
   where f.loan_id = p_loan_id and f.fine_type = 'overdue';
  if found then
    return v_id;
  end if;

  if v_loan.returned_at is not null or v_loan.due_date >= public.today_ist() then
    return null;   -- not overdue
  end if;

  v_owed := public.calculate_fine(v_loan.due_date, null, v_loan.fine_per_day_at_issue,
                                  public.today_ist());
  if v_owed <= 0 then
    return null;
  end if;

  insert into public.fines (loan_id, member_id, fine_type, amount, assessed_at)
  values (p_loan_id, v_loan.member_id, 'overdue', v_owed, now())
  on conflict (loan_id) where fine_type = 'overdue' do nothing
  returning id into v_id;

  insert into public.loan_events (loan_id, copy_id, member_id, event_type, actor_id, details)
  values (p_loan_id, v_loan.copy_id, v_loan.member_id, 'fine_assessed', v_actor,
          jsonb_build_object('amount', v_owed, 'reason', 'overdue at counter'));

  return v_id;
end;
$$;

-- renew_loan: read-only about fines. It never inserts before raising, so a
-- refusal cannot roll back an assessment.
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

grant execute on function public.assess_overdue_fine(uuid) to authenticated;
