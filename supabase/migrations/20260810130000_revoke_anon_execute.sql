-- ============================================================================
-- Revoke anon EXECUTE on the privileged RPCs.
--
-- DEFENCE IN DEPTH, not a fix for a live hole. Every function below already
-- begins with assert_librarian() (or an equivalent check), and an anonymous
-- call today fails with "You must be signed in to do this." — verified against
-- waive_fine() before writing this. The boundary was never open.
--
-- Two reasons to revoke anyway:
--
--   1. PostgreSQL grants EXECUTE to `public` by default, so every new function
--      is reachable by anon until someone says otherwise. Supabase's security
--      advisor flags each one (anon_security_definer_function_executable).
--   2. A future function whose author forgets the assert_librarian() line
--      should fail closed rather than open. The grant is the second barrier.
--
-- register_member() is deliberately excluded: self-registration is called
-- before the applicant has signed in, so anon MUST retain execute on it. It
-- does its own gating via the public_registration toggle.
--
-- Trigger functions (handle_new_user, guard_profile_privileged_columns,
-- rls_auto_enable) are also excluded — they are fired by the system, never
-- called over the API, so their grants are irrelevant either way.
-- ============================================================================

revoke execute on function
  public.approve_and_issue(uuid, text, public.member_type),
  public.approve_member(uuid, public.member_type, text, text),
  public.assert_librarian(),
  public.assess_overdue_fine(uuid),
  public.is_approved_user(),
  public.is_librarian(),
  public.issue_book(text, uuid),
  public.mark_copy_lost(text, text),
  public.member_unpaid_fine_total(uuid),
  public.pay_fine(uuid, text),
  public.reject_member(uuid, text),
  public.renew_loan(uuid),
  public.return_book(uuid),
  public.waive_fine(uuid, text)
from public, anon;

-- The app calls these as a signed-in librarian, so `authenticated` keeps
-- execute. The role check inside each function is what distinguishes a
-- librarian from an ordinary member — the grant only gates "signed in at all".
grant execute on function
  public.approve_and_issue(uuid, text, public.member_type),
  public.approve_member(uuid, public.member_type, text, text),
  public.assert_librarian(),
  public.assess_overdue_fine(uuid),
  public.is_approved_user(),
  public.is_librarian(),
  public.issue_book(text, uuid),
  public.mark_copy_lost(text, text),
  public.member_unpaid_fine_total(uuid),
  public.pay_fine(uuid, text),
  public.reject_member(uuid, text),
  public.renew_loan(uuid),
  public.return_book(uuid),
  public.waive_fine(uuid, text)
to authenticated;

-- No grant-back for is_librarian() / is_approved_user().
--
-- A policy expression runs as the querying role, so if an anon-role session
-- ever evaluated a policy calling these, the revoke above would surface as a
-- permission error rather than a plain `false`. Checked before relying on it:
-- every policy referencing either helper is scoped `to authenticated`, so anon
-- never evaluates one. Should a future policy expose one of these tables to
-- anon, grant execute back to anon in that same migration.
