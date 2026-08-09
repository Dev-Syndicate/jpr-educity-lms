-- ============================================================================
-- Jeppiaar Educity LMS — extensions, enums, shared utilities
--
-- Documented in docs/database-schema.html. Update that file BEFORE changing
-- anything here.
-- ============================================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "pg_trgm";    -- fuzzy/partial member + book search

-- ---------------------------------------------------------------------------
-- Enums. Closed sets the application switches on: enums give type safety and
-- cheap storage, and a bad value fails at write time rather than silently.
-- ---------------------------------------------------------------------------

create type public.user_role      as enum ('librarian', 'member');
create type public.member_type    as enum ('student', 'staff');
create type public.account_status as enum ('pending', 'active', 'rejected');
create type public.copy_status    as enum ('available', 'issued', 'lost', 'damaged');
create type public.copy_condition as enum ('new', 'good', 'fair', 'poor');
create type public.fine_type      as enum ('overdue', 'lost', 'damage');

comment on type public.member_type is
  '"staff" means teaching faculty who borrow books. Library staff are librarians.';

comment on type public.account_status is
  'pending: self-registered, awaiting approval at the counter — cannot borrow.
   active: may borrow. rejected: retained on record, cannot log in.';

-- ---------------------------------------------------------------------------
-- today_ist(): the single source of truth for "what day is it".
--
-- Supabase runs in UTC. Between 00:00 and 05:30 IST, current_date still
-- reports YESTERDAY in India — which would undercount a day of fine and could
-- record a morning return as having happened the previous day.
--
-- NEVER use bare current_date anywhere in this schema.
-- ---------------------------------------------------------------------------

create or replace function public.today_ist()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Kolkata')::date;
$$;

comment on function public.today_ist() is
  'Current calendar date in Asia/Kolkata. Use instead of current_date everywhere.';

-- ---------------------------------------------------------------------------
-- Generic updated_at trigger, attached to every mutable table.
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
