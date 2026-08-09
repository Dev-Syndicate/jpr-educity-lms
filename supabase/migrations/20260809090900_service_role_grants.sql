-- ============================================================================
-- Grants for the service_role.
--
-- The project was created with "Automatically expose new tables" disabled, so
-- new tables get NO privileges by default — including for service_role. That
-- role is exempt from row-level security, but exemption from RLS is not the
-- same as having table privileges, so every query failed with
-- "permission denied for table ...".
--
-- The admin client needs this to create member and librarian accounts.
-- ============================================================================

grant usage on schema public to service_role;

grant all privileges on all tables    in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all routines  in schema public to service_role;

-- Tables created by later migrations should inherit the same access, so this
-- does not have to be remembered every time.
alter default privileges in schema public
  grant all privileges on tables to service_role;

alter default privileges in schema public
  grant all privileges on sequences to service_role;

alter default privileges in schema public
  grant all privileges on routines to service_role;

-- ---------------------------------------------------------------------------
-- The `loans`, `fines` and `loan_events` tables have FORCE ROW LEVEL SECURITY,
-- which applies even to the table owner. Without a bypass, service_role would
-- still see nothing there.
--
-- Supabase's service_role already carries the bypassrls attribute, so no
-- policy is needed — but assert it here so a future change is caught early
-- rather than surfacing as an empty result set in production.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_roles where rolname = 'service_role' and rolbypassrls
  ) then
    raise warning
      'service_role lacks BYPASSRLS: admin reads of loans/fines will return no rows.';
  end if;
end;
$$;
