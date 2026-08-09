-- ============================================================================
-- settings — singleton configuration row (id must always equal 1)
--
-- Every borrowing rule the librarian can tune lives here. The RPCs read this
-- row, so it must always exist; deletion is blocked by trigger.
-- ============================================================================

create table public.settings (
  id                  smallint primary key default 1,
  loan_period_days    integer        not null default 15,
  fine_per_day        numeric(10,2)  not null default 1.00,
  max_renewals        integer        not null default 2,
  max_books_student   integer        not null default 3,
  max_books_staff     integer        not null default 5,

  -- Gates the public registration page. Off by default: registration is
  -- opened deliberately at the start of term, not left open by accident.
  public_registration boolean        not null default false,

  library_name        text           not null default 'Jeppiaar Educity Library',
  updated_at          timestamptz    not null default now(),
  updated_by          uuid           references auth.users(id) on delete set null,

  constraint settings_singleton    check (id = 1),
  constraint settings_loan_period  check (loan_period_days between 1 and 365),
  constraint settings_fine_per_day check (fine_per_day >= 0 and fine_per_day <= 10000),
  constraint settings_max_renewals check (max_renewals between 0 and 20),
  constraint settings_max_student  check (max_books_student between 0 and 100),
  constraint settings_max_staff    check (max_books_staff between 0 and 100)
);

comment on table public.settings is
  'Singleton configuration (id = 1). Editable by librarians only.
   Changes are NOT retroactive: loans snapshot their period and fine rate at
   issue time, so historical fines are never re-priced.';

comment on column public.settings.public_registration is
  'When false, register_member() refuses. Enforced in the database, not the UI.';

create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- The RPCs assume this row exists. Deleting it would break every issue and
-- renewal, so block deletion outright.
-- ---------------------------------------------------------------------------

create or replace function public.prevent_settings_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'The settings row cannot be deleted.';
end;
$$;

create trigger settings_no_delete
  before delete on public.settings
  for each row execute function public.prevent_settings_delete();
