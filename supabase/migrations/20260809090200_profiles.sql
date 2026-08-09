-- ============================================================================
-- profiles — one row per person, 1:1 with auth.users
--
-- Holds role, member type, and the approval state of self-registered accounts.
-- This is the most security-sensitive table in the schema: a member who could
-- edit their own `role` would own the system.
-- ============================================================================

create table public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  role           public.user_role      not null default 'member',
  member_type    public.member_type,          -- null iff role = 'librarian'
  account_status public.account_status not null default 'active',

  full_name      text not null,
  email          text not null,
  roll_number    text,                        -- roll no (student) / staff id
  department     text,
  phone          text,
  is_active      boolean not null default true,
  notes          text,

  -- Approval trail for self-registered accounts (account_status transitions).
  approved_by      uuid references public.profiles(id) on delete set null,
  approved_at      timestamptz,
  rejected_by      uuid references public.profiles(id) on delete set null,
  rejected_at      timestamptz,
  rejection_reason text,

  -- What the applicant CLAIMED at registration. Kept separate from the
  -- verified member_type so a librarian can see what was declared even after
  -- correcting it at approval time.
  declared_member_type public.member_type,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,

  -- A member MUST have a member_type; a librarian must NOT.
  constraint profiles_member_type_consistency check (
    (role = 'member'    and member_type is not null) or
    (role = 'librarian' and member_type is null)
  ),
  -- Librarians are never pending or rejected — they are only created by
  -- another librarian, so there is nothing to approve.
  constraint profiles_librarian_always_active check (
    role <> 'librarian' or account_status = 'active'
  ),
  constraint profiles_approval_consistent check (
    (account_status <> 'active')   or (approved_at is null) = (approved_by is null)
  ),
  constraint profiles_rejection_consistent check (
    (account_status = 'rejected' and rejected_at is not null and rejected_by is not null)
    or
    (account_status <> 'rejected')
  ),
  constraint profiles_full_name_not_blank check (length(btrim(full_name)) > 0),
  constraint profiles_email_format   check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint profiles_phone_format   check (phone is null or phone ~ '^[0-9+\-\s()]{6,20}$'),
  constraint profiles_roll_not_blank check (roll_number is null or length(btrim(roll_number)) > 0)
);

comment on table public.profiles is
  'One row per person. RLS lets a member read only their own row, and they have
   no UPDATE policy at all. See guard_profile_privileged_columns() below.';

comment on column public.profiles.declared_member_type is
  'What a self-registering applicant claimed. member_type is the verified value
   set by a librarian at approval. A false "staff" claim would grant 5 books
   instead of 3, so the librarian must check this against a college ID.';

comment on column public.profiles.roll_number is
  'Student roll number or staff employee ID. The identifier used at the counter.';

-- Roll numbers and emails unique, case-insensitively.
create unique index profiles_roll_number_unique
  on public.profiles (lower(roll_number))
  where roll_number is not null;

create unique index profiles_email_unique on public.profiles (lower(email));

create index profiles_role_idx           on public.profiles (role);
create index profiles_account_status_idx on public.profiles (account_status);
create index profiles_member_type_idx    on public.profiles (member_type) where role = 'member';
create index profiles_active_idx         on public.profiles (is_active);

-- Counter search by name / roll number. Trigram indexes support partial and
-- typo-tolerant matching, which is what a search box at a busy desk needs.
create index profiles_full_name_trgm_idx
  on public.profiles using gin (full_name gin_trgm_ops);
create index profiles_roll_number_trgm_idx
  on public.profiles using gin (roll_number gin_trgm_ops);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- CRITICAL SECURITY TRIGGER
--
-- Defence in depth against privilege escalation. Members are given no UPDATE
-- policy on this table at all, but policies get loosened by mistake over time;
-- this trigger fires regardless of what the policies say.
--
-- A non-librarian can never change role, member_type, account_status,
-- roll_number or is_active — on any row, including their own.
--
-- SECURITY DEFINER RPCs run as the function owner, for which auth.uid() is
-- null; that case is allowed so the admin RPCs still work.
-- ---------------------------------------------------------------------------

create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_is_librarian boolean;
begin
  -- Running inside a SECURITY DEFINER RPC (no end-user JWT): allow.
  if auth.uid() is null then
    return new;
  end if;

  select p.role = 'librarian'
    into caller_is_librarian
    from public.profiles p
   where p.id = auth.uid();

  if coalesce(caller_is_librarian, false) then
    return new;
  end if;

  if new.role           is distinct from old.role
  or new.member_type    is distinct from old.member_type
  or new.account_status is distinct from old.account_status
  or new.roll_number    is distinct from old.roll_number
  or new.is_active      is distinct from old.is_active then
    raise exception 'You are not allowed to change your own role, status or roll number.';
  end if;

  return new;
end;
$$;

create trigger profiles_guard_privileged_columns
  before update on public.profiles
  for each row execute function public.guard_profile_privileged_columns();

-- ---------------------------------------------------------------------------
-- Every auth.users row gets a profile. Defaults are deliberately powerless:
-- role 'member', status 'pending'. So even if Supabase sign-up were left
-- enabled by mistake, a leaked signup yields an account that cannot borrow.
--
-- register_member() overwrites these fields with validated values.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, role, member_type, account_status, full_name, email)
  values (
    new.id,
    'member',
    'student',
    'pending',
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
