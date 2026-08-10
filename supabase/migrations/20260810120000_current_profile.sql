-- ============================================================================
-- current_profile() — the signed-in user's row, without a prior round trip.
--
-- The DAL needs two things on every page load: a verified token (an auth-server
-- call) and the caller's profile row (a database call). Run in sequence they
-- cost two serial round trips, because the profile query needs an id and the id
-- comes from verifying the token. Where the app and the database are in
-- different regions, that ordering dominates page latency.
--
-- Resolving auth.uid() inside the database breaks the dependency, so the two
-- calls can be issued concurrently and the caller waits for the slower one.
--
-- This is a LATENCY optimisation, never an authentication step. The DAL still
-- discards the result unless getUser() independently verified the token, and
-- still checks the returned id matches that verified user.
--
-- SECURITY DEFINER, matching is_librarian(): the profiles policies call
-- is_librarian(), which reads profiles, so a definer function here keeps this
-- consistent with the existing helpers and avoids re-entering those policies.
-- It is not a privilege hole — the WHERE clause pins the result to auth.uid(),
-- so a caller can only ever receive their own row. With no valid JWT,
-- auth.uid() is null and the function returns no row at all.
--
-- A plain `select ... where id = <uid>` from the client could not replace this:
-- a librarian's profiles_select_librarian policy can read EVERY profile, so the
-- id filter is what confines the query to their own row — and supplying that
-- filter is precisely what would have required the extra round trip.
-- ============================================================================

create or replace function public.current_profile()
returns public.profiles
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.profiles where id = auth.uid();
$$;

comment on function public.current_profile() is
  'The signed-in user''s profile row, resolved from auth.uid() inside the
   database so it can be fetched in parallel with token verification rather
   than after it. A latency optimisation only — callers must still verify the
   token independently and confirm the returned id matches.';

-- authenticated only: an anonymous caller has no auth.uid() and would get
-- nothing back regardless, but there is no reason to expose the entry point.
revoke all on function public.current_profile() from public, anon;
grant execute on function public.current_profile() to authenticated;
