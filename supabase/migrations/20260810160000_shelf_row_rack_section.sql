-- ============================================================================
-- Replace the free-text shelf_location with a structured shelf address.
--
-- The racks are labelled "ROW NO.09 / RACK-01 / SECTION-A", so a copy's
-- location is three parts, and it is stored as three columns:
--
--   row_no   "09"
--   rack_no  "01"
--   section  "A"
--
-- Three columns rather than one string because the parts get asked about
-- separately — "everything in Row 09", "what is in Rack-01" — which is an
-- indexed equality test here versus a `like` against whatever format someone
-- typed. One field also drifts: 09-01-A, R9/R1/A and "Row 9 Rack 1" all name
-- the same shelf, none of them sort, and nothing stops all three coexisting.
--
-- All three are optional: a copy can be catalogued before it is shelved.
-- Text, not integers — rack labels are not reliably numeric ("09A" happens).
--
-- EXISTING DATA IS PRESERVED, NOT PARSED
-- Each old shelf_location moves into `section` verbatim. Splitting "A-01" into
-- a rack and a section would be guesswork about a format that was never
-- enforced, and a wrong guess silently sends a librarian to the wrong shelf.
-- Re-entering a few locations by hand is cheap; discovering they are quietly
-- wrong is not.
-- ============================================================================

alter table public.book_copies add column row_no  text;
alter table public.book_copies add column rack_no text;
alter table public.book_copies add column section text;

-- Verbatim into section — see the note above on why this is not parsed.
update public.book_copies
   set section = nullif(btrim(shelf_location), '')
 where shelf_location is not null;

alter table public.book_copies drop column shelf_location;

-- Bounded so a mis-paste cannot write a paragraph into a shelf label. Blank is
-- not a location: the app writes NULL when the field is cleared, and these
-- stop an empty string sneaking in to mean something different from "unknown".
alter table public.book_copies
  add constraint copies_row_no_len  check (row_no  is null or length(btrim(row_no))  between 1 and 20),
  add constraint copies_rack_no_len check (rack_no is null or length(btrim(rack_no)) between 1 and 20),
  add constraint copies_section_len check (section is null or length(btrim(section)) between 1 and 20);

comment on column public.book_copies.row_no is
  'Row on the rack label, e.g. "09". Text, not a number — labels are not
   always numeric. Null until the copy is shelved.';
comment on column public.book_copies.rack_no is
  'Rack within the row, e.g. "01".';
comment on column public.book_copies.section is
  'Section within the rack, e.g. "A". Also holds any location carried over
   from the old free-text shelf_location column.';

-- "What is on Row 09, Rack 01?" — the walk-to-the-shelf query. Ordered
-- row -> rack -> section so a prefix lookup on row alone uses it too.
create index copies_location_idx
  on public.book_copies (row_no, rack_no, section)
  where row_no is not null;
