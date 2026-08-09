-- ============================================================================
-- Row Level Security
--
-- The real security boundary. These policies hold even when someone bypasses
-- the application entirely and calls PostgREST directly with a member's JWT.
--
-- Shape of the model:
--   * librarians    — full access to everything
--   * active members — read their OWN profile/loans/fines, read the catalogue
--   * pending/rejected — effectively nothing beyond their own profile row
--   * members have NO write policy on any table, anywhere
-- ============================================================================

alter table public.profiles    enable row level security;
alter table public.settings    enable row level security;
alter table public.books       enable row level security;
alter table public.book_copies enable row level security;
alter table public.loans       enable row level security;
alter table public.fines       enable row level security;
alter table public.loan_events enable row level security;

-- Force RLS even for the table owner on the tables holding personal and
-- financial data. Deliberately NOT applied to profiles: that would strip
-- is_librarian()'s owner exemption and reintroduce the recursion it fixes.
alter table public.loans       force row level security;
alter table public.fines       force row level security;
alter table public.loan_events force row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

-- A user can always read their own row — including while pending or rejected,
-- so the portal can tell them their status.
create policy profiles_select_own
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create policy profiles_select_librarian
  on public.profiles for select
  to authenticated
  using (public.is_librarian());

-- NOTE: members get NO insert/update/delete policy at all. Combined with
-- guard_profile_privileged_columns(), that is two independent barriers against
-- privilege escalation.
create policy profiles_insert_librarian
  on public.profiles for insert
  to authenticated
  with check (public.is_librarian());

create policy profiles_update_librarian
  on public.profiles for update
  to authenticated
  using (public.is_librarian())
  with check (public.is_librarian());

-- No DELETE policy for anyone. Members are deactivated, never deleted, so
-- borrowing history survives.

-- ---------------------------------------------------------------------------
-- settings — everyone reads (the UI needs loan period and fine rate to explain
-- the rules), only librarians write.
-- ---------------------------------------------------------------------------

create policy settings_select_all
  on public.settings for select
  to authenticated
  using (true);

-- The registration page must know whether registration is open, and it is
-- reachable before login.
create policy settings_select_anon
  on public.settings for select
  to anon
  using (true);

create policy settings_update_librarian
  on public.settings for update
  to authenticated
  using (public.is_librarian())
  with check (public.is_librarian());

-- ---------------------------------------------------------------------------
-- books and book_copies — catalogue is readable by approved users only.
-- A pending or rejected account sees nothing.
-- ---------------------------------------------------------------------------

create policy books_select_approved
  on public.books for select
  to authenticated
  using (public.is_approved_user());

create policy books_write_librarian
  on public.books for all
  to authenticated
  using (public.is_librarian())
  with check (public.is_librarian());

create policy copies_select_approved
  on public.book_copies for select
  to authenticated
  using (public.is_approved_user());

create policy copies_write_librarian
  on public.book_copies for all
  to authenticated
  using (public.is_librarian())
  with check (public.is_librarian());

-- ---------------------------------------------------------------------------
-- loans — a member sees only their own.
--
-- All writes go through the SECURITY DEFINER RPCs, which bypass RLS after
-- re-checking the caller. So there is deliberately no INSERT/UPDATE policy
-- even for librarians: circulation must go through the functions that enforce
-- the rules, never through a raw table write.
-- ---------------------------------------------------------------------------

create policy loans_select_own
  on public.loans for select
  to authenticated
  using (member_id = auth.uid());

create policy loans_select_librarian
  on public.loans for select
  to authenticated
  using (public.is_librarian());

-- ---------------------------------------------------------------------------
-- fines — same shape as loans.
-- ---------------------------------------------------------------------------

create policy fines_select_own
  on public.fines for select
  to authenticated
  using (member_id = auth.uid());

create policy fines_select_librarian
  on public.fines for select
  to authenticated
  using (public.is_librarian());

-- ---------------------------------------------------------------------------
-- loan_events — librarian read only. Append-only: no INSERT/UPDATE/DELETE
-- policy exists for anyone, so rows can only be written by the RPCs.
-- ---------------------------------------------------------------------------

create policy events_select_librarian
  on public.loan_events for select
  to authenticated
  using (public.is_librarian());

-- ---------------------------------------------------------------------------
-- Grants. RLS filters rows; grants decide whether the table is addressable at
-- all. Both are needed.
--
-- The project was created with "Automatically expose new tables" OFF, so
-- nothing is reachable unless granted here.
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;

grant select on public.profiles, public.books, public.book_copies,
                public.loans, public.fines, public.loan_events, public.settings
  to authenticated;

grant insert, update on public.profiles to authenticated;
grant update on public.settings to authenticated;
grant insert, update, delete on public.books, public.book_copies to authenticated;

-- Anonymous callers can read only the registration toggle.
grant select on public.settings to anon;

grant select on public.v_loans_with_fine, public.v_member_dues,
                public.v_books_catalogue
  to authenticated;
