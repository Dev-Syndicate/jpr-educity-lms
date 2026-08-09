-- ============================================================================
-- books — the bibliographic record (one row per title)
-- book_copies — one row per physical book on the shelf
--
-- Loans reference a COPY, not a title. That is what makes "this exact book is
-- out, that one is available" answerable.
-- ============================================================================

create table public.books (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  author      text not null,
  isbn        text,
  publisher   text,
  edition     text,
  year        smallint,
  category    text,
  language    text not null default 'English',
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null,

  constraint books_title_not_blank  check (length(btrim(title)) > 0),
  constraint books_author_not_blank check (length(btrim(author)) > 0),
  constraint books_year_range       check (year is null or year between 1400 and 2200),
  -- ISBN-10 / ISBN-13, with or without hyphens.
  constraint books_isbn_format check (
    isbn is null or replace(replace(isbn, '-', ''), ' ', '') ~ '^[0-9]{9}[0-9Xx]$|^[0-9]{13}$'
  )
);

-- ISBN unique when present, ignoring hyphens and spacing.
create unique index books_isbn_unique
  on public.books (replace(replace(isbn, '-', ''), ' ', ''))
  where isbn is not null;

create index books_category_idx on public.books (category);
create index books_author_idx   on public.books (lower(author));

-- ---------------------------------------------------------------------------
-- Full-text search over title / author / ISBN.
-- A GENERATED column keeps the tsvector in sync with no trigger code.
-- Weights: title (A) outranks author (B) outranks ISBN (C).
-- ---------------------------------------------------------------------------

alter table public.books
  add column search_vector tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(title, '')),  'A') ||
    setweight(to_tsvector('english', coalesce(author, '')), 'B') ||
    setweight(to_tsvector('simple',  coalesce(replace(isbn, '-', ''), '')), 'C') ||
    setweight(to_tsvector('english', coalesce(publisher, '')), 'D') ||
    setweight(to_tsvector('english', coalesce(category, '')),  'D')
  ) stored;

create index books_search_vector_idx on public.books using gin (search_vector);

-- Trigram indexes for "librarian types three letters" partial search.
create index books_title_trgm_idx  on public.books using gin (title  gin_trgm_ops);
create index books_author_trgm_idx on public.books using gin (author gin_trgm_ops);

create trigger books_set_updated_at
  before update on public.books
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Physical copies, one row per accession number.
-- ---------------------------------------------------------------------------

create table public.book_copies (
  id               uuid primary key default gen_random_uuid(),
  book_id          uuid not null references public.books(id) on delete restrict,
  accession_number text not null,
  status           public.copy_status    not null default 'available',
  condition        public.copy_condition not null default 'good',
  shelf_location   text,
  acquired_on      date,
  price            numeric(10,2),
  remarks          text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint copies_accession_format check (accession_number ~ '^JPR-[0-9]{5}$'),
  constraint copies_price_positive   check (price is null or price >= 0)
);

comment on column public.book_copies.accession_number is
  'Barcode-scannable unique ID, format JPR-00123. Changing the format requires
   updating copies_accession_format AND next_accession_number().';

create unique index copies_accession_unique on public.book_copies (accession_number);
create index copies_book_id_idx   on public.book_copies (book_id);
create index copies_status_idx    on public.book_copies (status);
-- Fast "how many copies of this title can I issue right now".
create index copies_available_idx on public.book_copies (book_id) where status = 'available';

create trigger copies_set_updated_at
  before update on public.book_copies
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Accession number generator, so librarians never hand-type one.
-- ---------------------------------------------------------------------------

create sequence if not exists public.accession_seq start with 1 increment by 1;

create or replace function public.next_accession_number()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'JPR-' || lpad(nextval('public.accession_seq')::text, 5, '0');
$$;
