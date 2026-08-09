-- ============================================================================
-- loans — the circulation record
-- fines — money owed, and its paper trail
-- loan_events — append-only audit log
-- ============================================================================

create table public.loans (
  id        uuid primary key default gen_random_uuid(),
  copy_id   uuid not null references public.book_copies(id) on delete restrict,
  book_id   uuid not null references public.books(id)       on delete restrict,
  member_id uuid not null references public.profiles(id)    on delete restrict,

  issued_at timestamptz not null default now(),
  issued_by uuid not null references public.profiles(id) on delete restrict,
  due_date  date not null,

  returned_at timestamptz,
  returned_to uuid references public.profiles(id) on delete set null,

  renewal_count   integer not null default 0,
  last_renewed_at timestamptz,
  last_renewed_by uuid references public.profiles(id) on delete set null,

  -- Snapshot of the settings in force when this loan was created, so changing
  -- settings later never retroactively re-prices a historical loan.
  loan_period_days_at_issue integer       not null,
  fine_per_day_at_issue     numeric(10,2) not null,

  closed_reason text,   -- null = normal return; 'lost' | 'damaged' | 'written_off'
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint loans_renewal_count_nonneg  check (renewal_count >= 0),
  constraint loans_returned_after_issued check (returned_at is null or returned_at >= issued_at),
  constraint loans_period_positive       check (loan_period_days_at_issue > 0),
  constraint loans_fine_rate_nonneg      check (fine_per_day_at_issue >= 0),
  constraint loans_closed_reason_valid   check (
    closed_reason is null or closed_reason in ('lost', 'damaged', 'written_off')
  )
);

comment on table public.loans is
  'A loan has no status column. Its state is derived: open while returned_at is
   null, overdue when due_date < today_ist() and still open.';

comment on column public.loans.book_id is
  'Denormalised from book_copies for fast member-history queries without a
   join. Kept correct by the loans_set_book_id trigger.';

-- *** DOUBLE-ISSUE PREVENTION ***
-- A copy can have at most ONE open loan. This is structural: two concurrent
-- barcode scans cannot both succeed. The loser gets 23505, which issue_book()
-- translates into a readable message. No read-then-write race window exists.
create unique index loans_one_active_per_copy
  on public.loans (copy_id)
  where returned_at is null;

create index loans_member_idx        on public.loans (member_id, issued_at desc);
create index loans_active_member_idx on public.loans (member_id) where returned_at is null;
create index loans_copy_idx          on public.loans (copy_id);
create index loans_book_idx          on public.loans (book_id);
create index loans_due_date_idx      on public.loans (due_date) where returned_at is null;

create trigger loans_set_updated_at
  before update on public.loans
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Keep book_id consistent with copy_id automatically, so the denormalised
-- column can never drift from the copy it was taken from.
-- ---------------------------------------------------------------------------

create or replace function public.loans_set_book_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select c.book_id into new.book_id
    from public.book_copies c
   where c.id = new.copy_id;
  return new;
end;
$$;

create trigger loans_set_book_id_trg
  before insert or update of copy_id on public.loans
  for each row execute function public.loans_set_book_id();

-- ---------------------------------------------------------------------------
-- Keep book_copies.status in sync with the loans table.
--
-- Done as a trigger rather than trusting the RPCs, so that even raw SQL run in
-- the Supabase dashboard cannot leave a copy marked available while it is out.
-- Copies marked lost/damaged are left alone: those states outrank issue state.
-- ---------------------------------------------------------------------------

create or replace function public.sync_copy_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.book_copies
       set status = 'issued'
     where id = new.copy_id
       and status = 'available';

  elsif tg_op = 'UPDATE' then
    -- Loan closed: the copy comes back to the shelf.
    if old.returned_at is null and new.returned_at is not null then
      update public.book_copies
         set status = 'available'
       where id = new.copy_id
         and status = 'issued';

    -- Loan reopened (correcting a mistaken return).
    elsif old.returned_at is not null and new.returned_at is null then
      update public.book_copies
         set status = 'issued'
       where id = new.copy_id
         and status = 'available';
    end if;
  end if;

  return null;
end;
$$;

create trigger loans_sync_copy_status
  after insert or update of returned_at on public.loans
  for each row execute function public.sync_copy_status();

-- ============================================================================
-- fines
--
-- A separate table rather than columns on loans: a fine has its own lifecycle
-- (accrues, is assessed, is paid in cash or waived) and needs its own audit
-- columns. Columns on loans would force a pile of nullable fields and make
-- "unpaid fines per member" awkward.
--
-- NOTE: there is no carry-forward column. Because renewal is blocked while a
-- fine is unpaid, an overdue fine is always settled before the due date moves,
-- so nothing needs carrying.
-- ============================================================================

create table public.fines (
  id        uuid primary key default gen_random_uuid(),
  loan_id   uuid not null references public.loans(id)    on delete cascade,
  member_id uuid not null references public.profiles(id) on delete restrict,
  fine_type public.fine_type not null default 'overdue',

  -- Frozen final amount, written when the fine is assessed. NULL while still
  -- accruing — the live view computes the running value in that state.
  amount      numeric(10,2),
  assessed_at timestamptz,

  is_paid      boolean not null default false,
  paid_amount  numeric(10,2),
  paid_at      timestamptz,
  collected_by uuid references public.profiles(id) on delete set null,
  payment_note text,

  is_waived     boolean not null default false,
  waived_at     timestamptz,
  waived_by     uuid references public.profiles(id) on delete set null,
  waiver_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint fines_amount_nonneg  check (amount is null or amount >= 0),
  constraint fines_paid_nonneg    check (paid_amount is null or paid_amount >= 0),
  constraint fines_paid_consistent check (
    (is_paid = false and paid_at is null and collected_by is null and paid_amount is null)
    or
    (is_paid = true and paid_at is not null and collected_by is not null and paid_amount is not null)
  ),
  constraint fines_waived_consistent check (
    (is_waived = false and waived_at is null and waived_by is null and waiver_reason is null)
    or
    (is_waived = true and waived_at is not null and waived_by is not null
     and waiver_reason is not null and length(btrim(waiver_reason)) > 0)
  ),
  constraint fines_not_paid_and_waived check (not (is_paid and is_waived)),
  -- Can only settle an amount that has been frozen.
  constraint fines_settle_requires_assessment check (
    (not is_paid and not is_waived) or assessed_at is not null
  )
);

comment on table public.fines is
  'One overdue fine per loan (partial unique index below). Waiving REQUIRES a
   reason — enforced by fines_waived_consistent, not just by the UI.';

-- At most one overdue fine per loan, while still allowing an additional
-- 'lost' or 'damage' fine on the same loan later.
create unique index fines_one_overdue_per_loan
  on public.fines (loan_id)
  where fine_type = 'overdue';

create index fines_member_idx       on public.fines (member_id);
create index fines_unpaid_idx       on public.fines (member_id) where is_paid = false and is_waived = false;
create index fines_loan_idx         on public.fines (loan_id);
create index fines_collected_by_idx on public.fines (collected_by);

create trigger fines_set_updated_at
  before update on public.fines
  for each row execute function public.set_updated_at();

-- ============================================================================
-- loan_events — append-only audit trail.
--
-- Worth its keep: cash changes hands at the counter, and "I did return that
-- book" disputes are routine. No UPDATE or DELETE policy is ever granted.
-- ============================================================================

create table public.loan_events (
  id         bigint generated always as identity primary key,
  loan_id    uuid references public.loans(id)       on delete set null,
  copy_id    uuid references public.book_copies(id) on delete set null,
  member_id  uuid references public.profiles(id)    on delete set null,
  event_type text not null,
  actor_id   uuid references public.profiles(id)    on delete set null,
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint loan_events_type_valid check (event_type in (
    'issued', 'returned', 'renewed', 'fine_assessed', 'fine_paid', 'fine_waived',
    'marked_lost', 'marked_damaged', 'loan_reopened', 'settings_changed',
    'member_registered', 'member_approved', 'member_rejected'
  ))
);

create index loan_events_loan_idx   on public.loan_events (loan_id, created_at desc);
create index loan_events_member_idx on public.loan_events (member_id, created_at desc);
create index loan_events_type_idx   on public.loan_events (event_type, created_at desc);
