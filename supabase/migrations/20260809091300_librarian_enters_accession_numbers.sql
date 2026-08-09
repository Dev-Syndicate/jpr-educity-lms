-- ============================================================================
-- Accession numbers are entered by the librarian, not generated.
--
-- Every physical book already carries a serial — printed on a label or
-- written in the existing register. Generating a second, different number
-- meant the system and the shelf disagreed about what a copy is called, and
-- the scanner reads the label, not the database.
--
-- So: drop the JPR-00000 format check and the generator. Any text is a valid
-- accession number as long as it is non-blank and unique across the library.
-- Uniqueness is the constraint that actually matters — it is what makes a
-- scan identify exactly one copy.
--
-- Existing JPR-00001.. numbers stay valid; they simply are no longer the only
-- shape allowed.
-- ============================================================================

alter table public.book_copies
  drop constraint if exists copies_accession_format;

-- Non-blank, and bounded so a mis-scan cannot write a page of text.
alter table public.book_copies
  add constraint copies_accession_not_blank
  check (length(btrim(accession_number)) between 1 and 50);

comment on column public.book_copies.accession_number is
  'The serial printed on the physical copy, entered by the librarian. Any
   format; unique across the library. NOT generated — an invented number
   would not match the label the scanner reads.';

-- The unique index (copies_accession_unique) is unchanged and still does the
-- real work of making one scan identify one copy.

-- ---------------------------------------------------------------------------
-- Retire the generator.
--
-- Replaced with a function that raises rather than dropped outright: anything
-- still calling it fails loudly with an explanation instead of silently
-- inventing a number that matches no physical label.
-- ---------------------------------------------------------------------------

create or replace function public.next_accession_number()
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  raise exception
    'Accession numbers are entered from the physical copy, not generated.';
end;
$$;

drop sequence if exists public.accession_seq;
