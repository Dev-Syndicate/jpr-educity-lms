-- ============================================================================
-- Helper functions and read-side views, including live fine calculation.
--
-- Helpers come after the tables because they reference them, and before the
-- RLS policies because the policies call is_librarian().
-- ============================================================================

-- ---------------------------------------------------------------------------
-- is_librarian() — THE RLS RECURSION FIX
--
-- A policy on profiles that reads profiles to check the caller's role would
-- re-invoke RLS on profiles, giving:
--   42P17 infinite recursion detected in policy for relation "profiles"
--
-- SECURITY DEFINER makes the inner SELECT run as the function owner, who owns
-- the table and is therefore exempt from RLS — so no re-entry occurs.
--
-- STABLE lets PostgreSQL evaluate it once per statement instead of once per
-- row, which matters enormously on large scans.
--
-- Do NOT apply `force row level security` to profiles: that would strip the
-- owner's exemption and reintroduce the recursion.
-- ---------------------------------------------------------------------------

create or replace function public.is_librarian()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.profiles p
     where p.id = auth.uid()
       and p.role = 'librarian'
       and p.is_active
  );
$$;

comment on function public.is_librarian() is
  'True when the current user is an active librarian. SECURITY DEFINER to avoid
   infinite recursion in the profiles RLS policies.';

-- Is the caller an approved, active member (or librarian)? Used to keep
-- pending and rejected accounts away from catalogue and loan data.
create or replace function public.is_approved_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.profiles p
     where p.id = auth.uid()
       and p.is_active
       and p.account_status = 'active'
  );
$$;

-- ---------------------------------------------------------------------------
-- calculate_fine() — the one place the fine formula lives.
--
-- IMMUTABLE: same inputs always give the same answer, so it can be indexed
-- and inlined. Days late is counted from the day AFTER the due date, and
-- greatest(0, ...) guards against a renewal pushing the due date past today.
-- ---------------------------------------------------------------------------

create or replace function public.calculate_fine(
  p_due_date     date,
  p_returned_at  timestamptz,
  p_fine_per_day numeric,
  p_today        date
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round(
    greatest(
      0,
      coalesce(
        -- Returned: count up to the return date (in IST).
        (p_returned_at at time zone 'Asia/Kolkata')::date,
        -- Still out: count up to today.
        p_today
      ) - p_due_date
    ) * p_fine_per_day,
    2
  );
$$;

comment on function public.calculate_fine is
  'Rupees owed for a loan. Zero on or before the due date. Uses the loan''s
   snapshotted fine rate so a settings change never re-prices history.';

-- ---------------------------------------------------------------------------
-- v_loans_with_fine — the read model for every loan screen.
--
-- Live outstanding fine for both returned and still-out books:
--   * fine already assessed  -> report the frozen amount
--   * still accruing         -> compute from today
-- ---------------------------------------------------------------------------

create or replace view public.v_loans_with_fine
with (security_invoker = true)
as
select
  l.id,
  l.copy_id,
  l.book_id,
  l.member_id,
  l.issued_at,
  l.issued_by,
  l.due_date,
  l.returned_at,
  l.returned_to,
  l.renewal_count,
  l.loan_period_days_at_issue,
  l.fine_per_day_at_issue,
  l.closed_reason,

  b.title       as book_title,
  b.author      as book_author,
  c.accession_number,

  p.full_name   as member_name,
  p.roll_number as member_roll_number,
  p.member_type,

  (l.returned_at is null)                                    as is_open,
  (l.returned_at is null and l.due_date < public.today_ist()) as is_overdue,

  -- Days late for an open loan; null once returned. (FILTER is aggregate-only,
  -- so this must be a CASE.)
  case
    when l.returned_at is null then greatest(0, public.today_ist() - l.due_date)
    else null
  end                                                        as days_overdue,

  f.id          as fine_id,
  f.is_paid     as fine_is_paid,
  f.is_waived   as fine_is_waived,
  f.assessed_at as fine_assessed_at,

  -- The number to show the user.
  case
    when f.id is null then
      -- No fine row yet: compute what has accrued so far.
      public.calculate_fine(l.due_date, l.returned_at, l.fine_per_day_at_issue, public.today_ist())
    when f.assessed_at is not null then
      -- Frozen at assessment. Never recomputed, so a rate change cannot
      -- silently re-price it.
      coalesce(f.amount, 0)
    else
      public.calculate_fine(l.due_date, l.returned_at, l.fine_per_day_at_issue, public.today_ist())
  end as fine_amount,

  -- Still owed right now (0 once paid or waived).
  case
    when f.id is not null and (f.is_paid or f.is_waived) then 0
    when f.assessed_at is not null then coalesce(f.amount, 0)
    else public.calculate_fine(l.due_date, l.returned_at, l.fine_per_day_at_issue, public.today_ist())
  end as fine_outstanding

from public.loans l
join public.books       b on b.id = l.book_id
join public.book_copies c on c.id = l.copy_id
join public.profiles    p on p.id = l.member_id
left join public.fines  f on f.loan_id = l.id and f.fine_type = 'overdue';

comment on view public.v_loans_with_fine is
  'Loan read model with live fine. security_invoker = true so the caller''s RLS
   applies — a member sees only their own rows through this view.';

-- ---------------------------------------------------------------------------
-- v_member_dues — total outstanding per member.
--
-- Needed because a fine that has never been "touched" has no fines row yet;
-- summing the fines table alone would under-report what a member owes.
-- ---------------------------------------------------------------------------

create or replace view public.v_member_dues
with (security_invoker = true)
as
select
  member_id,
  count(*) filter (where is_open)                as books_out,
  count(*) filter (where is_overdue)             as books_overdue,
  coalesce(sum(fine_outstanding), 0)             as total_outstanding
from public.v_loans_with_fine
group by member_id;

-- ---------------------------------------------------------------------------
-- v_books_catalogue — titles with live availability counts.
-- ---------------------------------------------------------------------------

create or replace view public.v_books_catalogue
with (security_invoker = true)
as
select
  b.id,
  b.title,
  b.author,
  b.isbn,
  b.publisher,
  b.edition,
  b.year,
  b.category,
  b.language,
  b.description,
  b.search_vector,
  count(c.id)                                          as total_copies,
  count(c.id) filter (where c.status = 'available')     as available_copies,
  count(c.id) filter (where c.status = 'issued')        as issued_copies
from public.books b
left join public.book_copies c on c.book_id = b.id
group by b.id;

-- ---------------------------------------------------------------------------
-- member_active_loan_count() — used by issue_book to enforce the limit.
-- Lost/damaged loans are closed, so they never count against a member forever.
-- ---------------------------------------------------------------------------

create or replace function public.member_active_loan_count(p_member_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer
    from public.loans
   where member_id = p_member_id
     and returned_at is null;
$$;

-- Unpaid, unwaived fine total for a member.
--
-- Computed from the base tables rather than v_loans_with_fine: that view is
-- security_invoker, so calling it from a SECURITY DEFINER function would apply
-- the CALLER's RLS and could return 0 for a member who actually owes money.
create or replace function public.member_unpaid_fine_total(p_member_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(
    case
      when f.id is not null and (f.is_paid or f.is_waived) then 0
      when f.assessed_at is not null then coalesce(f.amount, 0)
      else public.calculate_fine(l.due_date, l.returned_at, l.fine_per_day_at_issue,
                                 public.today_ist())
    end
  ), 0)
  from public.loans l
  left join public.fines f on f.loan_id = l.id and f.fine_type = 'overdue'
  where l.member_id = p_member_id;
$$;
