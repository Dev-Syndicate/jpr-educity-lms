-- ============================================================================
-- Split the old free-text `category` into a real category and a department.
--
-- `books.category` was free text and in practice held subject names like
-- "Computer Science" — which is a DEPARTMENT, not a category. The library
-- actually classifies items two ways, and they answer different questions:
--
--   category   what kind of item is it?      book, thesis, magazine, ...
--   department which department owns it?     "S & H", "CSE", "MECH"
--
-- category becomes an enum: the list is a library-wide classification and
-- should not grow by typo. Adding a kind is a migration, deliberately.
--
-- department stays free text: it follows however the racks are labelled, which
-- varies by campus. (Unrelated to profiles.department, the member's own.)
--
-- MIGRATION OF EXISTING ROWS
-- The old column only ever held subject names, so its value moves to
-- `department` and `category` defaults to 'book'. Nothing is lost and nothing
-- is guessed at.
-- ============================================================================

create type public.material_category as enum (
  'book',
  'non_book_material',
  'project',
  'thesis',
  'proceeding',
  'magazine'
);

-- ---------------------------------------------------------------------------
-- Order matters here, and the dependency chain runs:
--
--   v_books_catalogue  ->  books.search_vector  ->  books.category
--
-- v_books_catalogue selects search_vector, so the column cannot be dropped
-- while the view exists. search_vector is in turn GENERATED from category, so
-- category cannot be altered while the column exists. Everything therefore
-- comes down in reverse order and is rebuilt at the bottom of this file.
--
-- No data is lost either way: a generated column stores nothing of its own,
-- and a view stores nothing at all.
-- ---------------------------------------------------------------------------
drop view if exists public.v_books_catalogue;

drop index if exists public.books_search_vector_idx;
alter table public.books drop column search_vector;

-- Free-text department, carrying the old category's value across.
alter table public.books add column department text;
update public.books set department = category where category is not null;

-- Replace the text category with the enum. Every surviving row becomes 'book':
-- the old values were subject names, which have just moved to department.
alter table public.books drop column category;
alter table public.books
  add column category public.material_category not null default 'book';

comment on column public.books.category is
  'What kind of item this is. Fixed list — a new kind requires a migration.';
comment on column public.books.department is
  'Owning department, e.g. "S & H" or "CSE". Free text, matching the rack
   labels. NOT profiles.department, which is the member''s own department.';

-- ---------------------------------------------------------------------------
-- Rebuild search_vector, now also covering department at weight D — below
-- title (A), author (B) and ISBN (C), so a department match never outranks a
-- real title match.
--
-- category is deliberately NOT in here. Casting an enum to text goes through
-- enum_out, which Postgres marks STABLE rather than IMMUTABLE (verified in
-- pg_proc), and a generated column requires a wholly immutable expression:
--
--   ERROR: generation expression is not immutable (SQLSTATE 42P17)
--
-- No loss. category is a closed six-value list that the UI filters on with a
-- dropdown and an equality test against books_category_idx below — free-text
-- search over it would be the wrong tool anyway. Only free-form fields, where
-- the user cannot know the exact value in advance, need the tsvector.
-- ---------------------------------------------------------------------------
alter table public.books
  add column search_vector tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(title, '')),  'A') ||
    setweight(to_tsvector('english', coalesce(author, '')), 'B') ||
    setweight(to_tsvector('simple',  coalesce(replace(isbn, '-', ''), '')), 'C') ||
    setweight(to_tsvector('english', coalesce(publisher, '')), 'D') ||
    setweight(to_tsvector('english', coalesce(department, '')), 'D')
  ) stored;

create index books_search_vector_idx on public.books using gin (search_vector);

-- The old index was on the free-text category; it went with the column.
-- Index both new columns — the catalogue filters on either.
drop index if exists public.books_category_idx;
create index books_category_idx   on public.books (category);
create index books_department_idx on public.books (department);

-- ---------------------------------------------------------------------------
-- v_books_catalogue selected b.category and must now also expose department.
-- Recreated wholesale rather than patched: a view's column list is fixed at
-- creation, and the underlying column changed type.
--
-- security_invoker = true is carried over deliberately. Without it the view
-- would run as its owner and bypass the querying user's RLS.
--
-- Already dropped above, before search_vector — see the dependency note there.
-- ---------------------------------------------------------------------------
create view public.v_books_catalogue
with (security_invoker = true)
as
select
  b.id,
  b.title,
  b.author,
  b.isbn,
  b.publisher,
  b.edition,
  b.year,
  b.category,
  b.department,
  b.language,
  b.description,
  b.search_vector,
  count(c.id)                                          as total_copies,
  count(c.id) filter (where c.status = 'available')     as available_copies,
  count(c.id) filter (where c.status = 'issued')        as issued_copies
from public.books b
left join public.book_copies c on c.book_id = b.id
group by b.id;

-- A dropped view loses its grants, so restore exactly what it had before
-- (checked against information_schema before writing this): SELECT for
-- authenticated, full privileges for service_role, and deliberately NOTHING
-- for anon — the catalogue is not public.
--
-- RLS on the underlying tables still applies through security_invoker, so this
-- grant lets a member reach the view, not see rows they otherwise could not.
grant select on public.v_books_catalogue to authenticated;
grant all privileges on public.v_books_catalogue to service_role;
