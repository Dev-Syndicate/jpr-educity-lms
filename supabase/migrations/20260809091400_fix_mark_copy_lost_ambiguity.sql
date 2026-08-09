-- ============================================================================
-- mark_copy_lost — fix an ambiguous column reference, and a stale loan row.
--
-- BUG 1 (why the button never worked)
-- -----------------------------------
-- The function declares OUT parameters (copy_id, book_title, closed_loan) and
-- then writes:
--
--     select * into v_loan from public.loans
--      where copy_id = v_copy.id and returned_at is null;
--
-- `copy_id` there is both the OUT parameter and loans.copy_id, so Postgres
-- refuses with 42702 "column reference copy_id is ambiguous". Every attempt
-- to mark a copy lost failed, and the app reported the generic fallback
-- "Could not mark that copy lost." rather than this.
--
-- Fixed by aliasing the table and qualifying the column (l.copy_id).
--
-- BUG 2 (found while fixing the first)
-- ------------------------------------
-- `select * into v_loan` leaves v_loan holding NULLs when the copy is not on
-- loan, but the audit insert used v_loan.id and v_loan.member_id
-- unconditionally. Worse, `if found` was tested AFTER an intervening update,
-- so `found` no longer described the loan lookup at all. A copy marked lost
-- while sitting on the shelf recorded an event pointing at no loan, and the
-- returned closed_loan was whatever v_loan happened to contain.
--
-- Now a boolean captured at the point of the lookup decides both.
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
  v_actor    uuid := public.assert_librarian();
  v_copy     public.book_copies%rowtype;
  v_loan     public.loans%rowtype;
  v_has_loan boolean;
  v_fine     numeric;
  v_title    text;
begin
  select * into v_copy
    from public.book_copies c
   where c.accession_number = upper(btrim(p_accession_number));

  if not found then
    raise exception 'No copy with serial number %.', upper(btrim(p_accession_number));
  end if;

  if v_copy.status = 'lost' then
    raise exception 'Copy % is already marked lost.', v_copy.accession_number;
  end if;

  -- l.copy_id, not copy_id: the bare name collides with the OUT parameter.
  select * into v_loan
    from public.loans l
   where l.copy_id = v_copy.id
     and l.returned_at is null
   for update;

  -- Captured here, because `found` is clobbered by the next statement.
  v_has_loan := found;

  if v_has_loan then
    v_fine := public.calculate_fine(v_loan.due_date, now(), v_loan.fine_per_day_at_issue,
                                    public.today_ist());

    update public.loans l
       set returned_at   = now(),
           returned_to   = v_actor,
           closed_reason = 'lost'
     where l.id = v_loan.id;

    -- A lost book is still owed for the days it was overdue, so the fine is
    -- frozen at today rather than forgiven.
    if v_fine > 0 then
      update public.fines f
         set amount = v_fine, assessed_at = now()
       where f.loan_id = v_loan.id
         and f.fine_type = 'overdue'
         and not f.is_paid
         and not f.is_waived;

      if not found then
        insert into public.fines (loan_id, member_id, fine_type, amount, assessed_at)
        values (v_loan.id, v_loan.member_id, 'overdue', v_fine, now())
        on conflict (loan_id) where fine_type = 'overdue' do nothing;
      end if;
    end if;
  end if;

  update public.book_copies c
     set status  = 'lost',
         remarks = coalesce(p_note, c.remarks)
   where c.id = v_copy.id;

  select b.title into v_title from public.books b where b.id = v_copy.book_id;

  -- Null loan/member when the copy was on the shelf, rather than whatever
  -- v_loan happened to hold.
  insert into public.loan_events (loan_id, copy_id, member_id, event_type, actor_id, details)
  values (
    case when v_has_loan then v_loan.id else null end,
    v_copy.id,
    case when v_has_loan then v_loan.member_id else null end,
    'marked_lost',
    v_actor,
    jsonb_build_object('accession_number', v_copy.accession_number,
                       'note', p_note,
                       'was_on_loan', v_has_loan)
  );

  return query
    select v_copy.id,
           v_title,
           case when v_has_loan then v_loan.id else null end;
end;
$$;
