-- ============================================================================
-- Let register_member() past the privilege-escalation guard.
--
-- THE BUG
-- -------
-- guard_profile_privileged_columns() exempted SECURITY DEFINER callers by
-- testing `auth.uid() is null`. That test is wrong: auth.uid() reads the
-- request-level GUC `request.jwt.claims`, which is NOT cleared when a
-- SECURITY DEFINER function is entered. Inside register_member() the caller
-- still looks like the applicant, so the trigger saw a non-librarian setting
-- roll_number / declared_member_type and refused with
--
--     "You are not allowed to change your own role, status or roll number."
--
-- Public self-registration was therefore impossible: every applicant got a
-- bare profile with no roll number and no claimed member type, which is
-- exactly what the librarian needs at the counter to identify them.
--
-- THE FIX
-- -------
-- register_member() sets a transaction-local flag that the trigger honours.
-- Being transaction-local (the `true` third argument), it cannot leak into
-- another statement, another session, or a connection returned to the pool.
--
-- Why this is not a new hole: privilege escalation is blocked by TWO
-- independent barriers, and this touches only the second one. A member has no
-- UPDATE policy on profiles at all, so RLS rejects the write before the
-- trigger is consulted. Setting the flag by hand from a member's session
-- achieves nothing.
--
-- The auth.uid()-is-null branch is kept: the service role genuinely has no
-- JWT, and admin scripts rely on it.
-- ============================================================================

create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_is_librarian boolean;
begin
  -- Service role / direct SQL: no end-user JWT at all.
  if auth.uid() is null then
    return new;
  end if;

  -- Inside a trusted SECURITY DEFINER function that vouched for this write.
  -- Transaction-local, so it cannot outlive the statement that set it.
  if coalesce(
       current_setting('app.privileged_write', true),  -- true = null if unset
       'off'
     ) = 'on' then
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

comment on function public.guard_profile_privileged_columns() is
  'Second of two barriers against privilege escalation (the first is the
   absence of any member UPDATE policy on profiles). Honours a
   transaction-local app.privileged_write flag so register_member() can stamp
   a new applicant, since auth.uid() is NOT cleared inside SECURITY DEFINER.';

-- ---------------------------------------------------------------------------
-- register_member — unchanged in behaviour, except that it now raises the
-- flag around its own UPDATE. Body reproduced in full because Postgres has no
-- partial function edit.
-- ---------------------------------------------------------------------------

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

  -- Only ever an applicant filling in their OWN row. Without this the
  -- function would be a way to overwrite somebody else's profile.
  if p_user_id is distinct from auth.uid() and auth.uid() is not null then
    raise exception 'You can only complete your own registration.';
  end if;

  select email into v_email from auth.users where id = p_user_id;

  -- Vouch for the write that follows. Transaction-local.
  perform set_config('app.privileged_write', 'on', true);

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
    perform set_config('app.privileged_write', 'off', true);
    raise exception 'Could not complete registration. Please try again.';
  end if;

  -- Lower it again so the rest of the transaction is guarded as normal.
  perform set_config('app.privileged_write', 'off', true);

  insert into public.loan_events (member_id, event_type, details)
  values (p_user_id, 'member_registered',
          jsonb_build_object('declared_member_type', p_declared_member_type,
                             'roll_number', btrim(p_roll_number)));

  return query select p_user_id, 'pending'::public.account_status;
end;
$$;

revoke execute on function
  public.register_member(uuid, text, text, text, public.member_type, text)
  from public, anon, authenticated;

grant execute on function
  public.register_member(uuid, text, text, text, public.member_type, text)
  to anon, authenticated;
