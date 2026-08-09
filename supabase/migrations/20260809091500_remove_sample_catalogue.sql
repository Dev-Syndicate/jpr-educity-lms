-- ============================================================================
-- Remove the sample catalogue, and fix a fresh-install failure it now causes.
--
-- TWO problems, both from 20260809090800_seed.sql:
--
-- 1. The eight demo titles ('Clean Code', 'Introduction to Algorithms', ...)
--    were scaffolding for building the counter screen. They are not the
--    college's collection, and a fresh deployment should not start with
--    someone else's books on the shelf.
--
-- 2. That seed creates its copies with public.next_accession_number(). Since
--    20260809091300 that function does nothing but `raise exception` —
--    accession numbers are now read off the physical copy by the librarian.
--    So on a BRAND NEW database `supabase db push` aborts at the seed and
--    never reaches the migrations after it. Anyone setting the project up
--    from scratch today cannot get past migration 9.
--
-- Migrations are append-only once applied, so the seed file is left exactly as
-- it is and this migration undoes its catalogue half. The settings singleton
-- the seed also inserts is configuration, not sample data, and is kept.
--
-- Safe to run on a database where the seed already succeeded (deletes the rows)
-- and on one where it never ran (deletes nothing).
-- ============================================================================

do $$
declare
  v_titles text[] := array[
    'Clean Code',
    'Introduction to Algorithms',
    'The Pragmatic Programmer',
    'Database System Concepts',
    'Operating System Concepts',
    'Computer Networks',
    'Artificial Intelligence: A Modern Approach',
    'Engineering Mathematics'
  ];
  v_with_history integer;
begin
  -- A demo title that has been lent is no longer demo data — someone has
  -- catalogued real circulation against it. Deleting it would destroy loan
  -- history, which DI-5 forbids. Stop and let a human decide instead of
  -- failing later on the `on delete restrict` with an opaque error.
  select count(*)
    into v_with_history
    from public.loans l
    join public.books b on b.id = l.book_id
   where b.title = any (v_titles);

  if v_with_history > 0 then
    raise notice
      'Sample catalogue kept: % loan(s) reference these titles. Retire the copies by hand rather than deleting history.',
      v_with_history;
    return;
  end if;

  delete from public.book_copies
   where book_id in (select id from public.books where title = any (v_titles));

  delete from public.books
   where title = any (v_titles);
end;
$$;
