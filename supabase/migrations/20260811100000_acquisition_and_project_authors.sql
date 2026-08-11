-- ============================================================================
-- Two additions to the catalogue, from PRD B-10 and B-11.
--
-- 1. ACQUISITION (every category)
--    How the item was bought: invoice_no, invoice_date, distributor, price,
--    plus total_pages describing the work itself. All optional — a donation
--    has no invoice, and a title is often catalogued before the paperwork is
--    filed. Refusing to shelve a book until Accounts produces the invoice
--    would be the software inventing a rule the library does not have.
--
-- 2. PROJECT / THESIS (category = 'project' or 'thesis')
--    A student submission also carries a project number, the students who
--    wrote it, and their department, degree and batch.
--
--    The students go in a CHILD TABLE, not in five sets of columns. A project
--    has one to six authors depending on the year, and columns sized for the
--    biggest team leave ~20 permanently-NULL fields on every ordinary book,
--    cap the team at whatever number was guessed here, and make "which
--    projects has roll 21CS045 worked on" a five-way OR instead of an
--    indexed lookup.
--
--    Department, degree and batch stay on `books` rather than repeating per
--    student: a project is submitted by one class in one batch, so storing
--    them per author invites four rows that disagree about a single fact.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Acquisition, on the title.
--
-- price here is the INVOICED price, and is deliberately a different column
-- from book_copies.price, which is the replacement charge billed when a copy
-- is lost. They start equal and drift: the replacement charge is revised as
-- the book gets older and harder to source, while the invoice is a historical
-- fact that must not move. Collapsing them would rewrite what was paid every
-- time a fine is repriced.
-- ---------------------------------------------------------------------------
alter table public.books
  add column total_pages  integer,
  add column invoice_no   text,
  add column invoice_date date,
  add column distributor  text,
  add column price        numeric(10,2);

alter table public.books
  add constraint books_total_pages_range
    check (total_pages is null or total_pages between 1 and 100000),
  add constraint books_price_positive
    check (price is null or price >= 0),
  -- Bounded and non-blank: the app writes NULL for an empty field, and these
  -- stop an empty string arriving to mean something subtly different from
  -- "not known", exactly as the shelf-address constraints do.
  add constraint books_invoice_no_len
    check (invoice_no is null or length(btrim(invoice_no)) between 1 and 60),
  add constraint books_distributor_len
    check (distributor is null or length(btrim(distributor)) between 1 and 200);

comment on column public.books.price is
  'Invoiced purchase price in rupees. NOT book_copies.price, which is the
   replacement charge for a lost copy — that one is revised over time, this
   one is a historical fact.';
comment on column public.books.total_pages is
  'Page count of the work. On the title, not the copy: every copy of one
   edition has the same pagination.';

-- Acquisition is audited by invoice — "what did we buy on INV-2291?" — so the
-- lookup is by invoice number, not by title. Partial: most rows are NULL.
create index books_invoice_no_idx on public.books (invoice_no)
  where invoice_no is not null;

-- ---------------------------------------------------------------------------
-- Project / thesis header.
--
-- Nullable rather than NOT NULL-with-a-category-check: a librarian catalogues
-- a thesis from the title page and may not have the project number to hand.
-- The constraint below is therefore about what may NOT be set, not about what
-- must be.
-- ---------------------------------------------------------------------------
alter table public.books
  add column project_no  text,
  add column degree      text,
  add column batch_month text;

alter table public.books
  add constraint books_project_no_len
    check (project_no is null or length(btrim(project_no)) between 1 and 60),
  add constraint books_degree_len
    check (degree is null or length(btrim(degree)) between 1 and 60),
  -- Free text, not a date: the batch is written as printed on the report
  -- ("May 2025", "Nov/Dec 2024"), and parsing that into a date would either
  -- reject the real spellings or silently pick a day nobody meant.
  add constraint books_batch_month_len
    check (batch_month is null or length(btrim(batch_month)) between 1 and 40);

-- These three describe a student submission. On a magazine they are noise at
-- best and wrong at worst, so the database refuses them rather than trusting
-- every future caller to clear them when the category changes.
alter table public.books
  add constraint books_project_fields_need_project_category check (
    category in ('project', 'thesis')
    or (project_no is null and degree is null and batch_month is null)
  );

comment on column public.books.project_no is
  'Register number of a project or thesis. Only meaningful when category is
   project or thesis — enforced by books_project_fields_need_project_category.';
comment on column public.books.batch_month is
  'Submission batch as printed on the report, e.g. "May 2025". Text, not a
   date: the real spellings ("Nov/Dec 2024") do not parse to one day.';

create index books_project_no_idx on public.books (project_no)
  where project_no is not null;

-- ---------------------------------------------------------------------------
-- The students.
--
-- on delete cascade, unlike book_copies' restrict: an author list is not an
-- independent record the way a physical copy is. Delete the project and the
-- list of who wrote it has nothing left to describe. (Deleting a title that
-- has circulated is still blocked by loans.book_id — see PRD B-9.)
-- ---------------------------------------------------------------------------
create table public.project_authors (
  id          uuid primary key default gen_random_uuid(),
  book_id     uuid not null references public.books(id) on delete cascade,
  roll_number text not null,
  full_name   text not null,
  -- Order on the title page. Authorship order is meaningful on a submission,
  -- and without it the list comes back in whatever order Postgres chose.
  position    smallint not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint project_authors_roll_not_blank
    check (length(btrim(roll_number)) between 1 and 40),
  constraint project_authors_name_not_blank
    check (length(btrim(full_name)) between 1 and 200),
  constraint project_authors_position_range
    check (position between 1 and 20)
);

comment on table public.project_authors is
  'Students who submitted a project or thesis. One row per student so the team
   size is not fixed by the schema. Department, degree and batch are on books
   — they belong to the project, not to each student.';

-- The same student cannot be listed twice on one project. Case-insensitive,
-- because "21cs045" and "21CS045" are one roll number, and a duplicate here
-- would double-count the student in any per-student report.
create unique index project_authors_book_roll_unique
  on public.project_authors (book_id, lower(btrim(roll_number)));

-- "Show me this project's authors" — the list is always read by project.
create index project_authors_book_id_idx
  on public.project_authors (book_id, position);

-- "Which projects has this student worked on?" — the reverse lookup, over the
-- same normalised form the unique index above uses.
create index project_authors_roll_idx
  on public.project_authors (lower(btrim(roll_number)));

create trigger project_authors_set_updated_at
  before update on public.project_authors
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS, matching book_copies exactly: readable by an APPROVED account, and
-- writable only by a librarian.
--
-- is_approved_user(), not `true`. These rows are named students with their
-- roll numbers, so a pending or rejected account reading them would breach
-- SEC-9 ("cannot read catalogue or loan data") with personal data attached —
-- a worse leak than the availability counts that rule was written for.
-- ---------------------------------------------------------------------------
alter table public.project_authors enable row level security;

create policy project_authors_select_approved
  on public.project_authors for select
  to authenticated
  using (public.is_approved_user());

create policy project_authors_write_librarian
  on public.project_authors for all
  to authenticated
  using (public.is_librarian())
  with check (public.is_librarian());

grant select on public.project_authors to authenticated;
grant insert, update, delete on public.project_authors to authenticated;
grant all privileges on public.project_authors to service_role;
