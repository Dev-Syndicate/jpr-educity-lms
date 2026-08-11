-- ============================================================================
-- books.call_no — the Dewey classification from the rack label (PRD B-8a).
--
-- The racks are labelled with a call number at the left of every row:
--
--   CALL NO   SUBJECT INDEX
--   530       ENGINEERING PHYSICS-II    - SECTION-A
--   420       TECHNICAL ENGLISH         - SECTION-B
--   512.943 4 MATRICES AND CALCULUS     - SECTION-C
--
-- ON THE TITLE, NOT THE COPY
-- A call number classifies the WORK: every copy of "Engineering Physics-II"
-- is 530 whichever shelf it happens to sit on. Row/rack/section stay on
-- book_copies because those genuinely differ per copy; the call number would
-- only be retyped for each one and left free to drift, so that two copies of
-- one title could end up claiming different subjects.
--
-- TEXT, NOT NUMERIC
-- "512.943 4" is not a number: it carries decimals AND internal spaces, and
-- some schemes append a Cutter suffix ("530.12 K54"). Parsing it as numeric
-- would lose the trailing segment and reorder the shelf.
-- ============================================================================

alter table public.books add column call_no text;

alter table public.books
  add constraint books_call_no_len
    check (call_no is null or length(btrim(call_no)) between 1 and 40);

comment on column public.books.call_no is
  'Dewey classification as printed on the rack label, e.g. "530" or
   "512.943 4". On the title because it classifies the work — every copy
   shares it. Text, not numeric: decimals, spaces and Cutter suffixes.';

-- "Show me everything in 530" — the walk-to-the-shelf query, and the reason
-- the number is on the label at all. Partial: null until a title is classified.
create index books_call_no_idx on public.books (call_no)
  where call_no is not null;

-- Prefix matching for "512.9…", which is how a Dewey class is narrowed. The
-- plain btree above cannot serve a leading-wildcard search; this can.
create index books_call_no_trgm_idx on public.books using gin (call_no gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Rebuild search_vector to include the call number, so the catalogue search
-- box accepts it alongside title, author and ISBN (PRD B-2).
--
-- Same dependency chain as 20260810150000, and for the same reason:
--
--   v_books_catalogue  ->  books.search_vector  ->  (new column)
--
-- The view selects search_vector, so the column cannot be dropped while the
-- view exists. Everything comes down in reverse order and is rebuilt below.
-- No data is lost: a generated column stores nothing of its own, and a view
-- stores nothing at all.
--
-- Weight D — the same as publisher and department. A call-number match must
-- never outrank a real title match, and 'simple' rather than 'english' because
-- "530" is a token to be matched exactly, not a word to be stemmed.
-- ---------------------------------------------------------------------------
drop view if exists public.v_books_catalogue;

drop index if exists public.books_search_vector_idx;
alter table public.books drop column search_vector;

alter table public.books
  add column search_vector tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(title, '')),  'A') ||
    setweight(to_tsvector('english', coalesce(author, '')), 'B') ||
    setweight(to_tsvector('simple',  coalesce(replace(isbn, '-', ''), '')), 'C') ||
    setweight(to_tsvector('english', coalesce(publisher, '')), 'D') ||
    setweight(to_tsvector('english', coalesce(department, '')), 'D') ||
    setweight(to_tsvector('simple',  coalesce(call_no, '')), 'D')
  ) stored;

create index books_search_vector_idx on public.books using gin (search_vector);

-- ---------------------------------------------------------------------------
-- Recreated wholesale rather than patched — a view's column list is fixed at
-- creation, and it must now also expose call_no for the catalogue list.
--
-- security_invoker = true is carried over deliberately. Without it the view
-- would run as its owner and bypass the querying user's RLS.
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
  b.call_no,
  b.language,
  b.description,
  b.search_vector,
  count(c.id)                                          as total_copies,
  count(c.id) filter (where c.status = 'available')     as available_copies,
  count(c.id) filter (where c.status = 'issued')        as issued_copies
from public.books b
left join public.book_copies c on c.book_id = b.id
group by b.id;

-- A dropped view loses its grants, so restore exactly what it had: SELECT for
-- authenticated, everything for service_role, and deliberately NOTHING for
-- anon — the catalogue is not public. RLS on the underlying tables still
-- applies through security_invoker.
grant select on public.v_books_catalogue to authenticated;
grant all privileges on public.v_books_catalogue to service_role;
