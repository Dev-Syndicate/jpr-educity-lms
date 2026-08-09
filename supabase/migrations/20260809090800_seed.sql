-- ============================================================================
-- Seed: the settings singleton, plus sample books for testing.
--
-- No user accounts are created here — auth users must be made through Supabase
-- Auth. See supabase/SETUP.md for promoting the first librarian.
-- ============================================================================

insert into public.settings (id) values (1)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Sample catalogue. Safe to delete once real data is loaded.
-- ---------------------------------------------------------------------------

insert into public.books (title, author, isbn, publisher, year, category) values
  ('Clean Code',                        'Robert C. Martin',   '9780132350884', 'Prentice Hall',    2008, 'Software Engineering'),
  ('Introduction to Algorithms',        'Thomas H. Cormen',   '9780262046305', 'MIT Press',        2022, 'Computer Science'),
  ('The Pragmatic Programmer',          'Andrew Hunt',        '9780135957059', 'Addison-Wesley',   2019, 'Software Engineering'),
  ('Database System Concepts',          'Abraham Silberschatz','9780078022159','McGraw-Hill',      2019, 'Databases'),
  ('Operating System Concepts',         'Abraham Silberschatz','9781118063330','Wiley',            2018, 'Computer Science'),
  ('Computer Networks',                 'Andrew S. Tanenbaum','9780132126953', 'Pearson',          2010, 'Networking'),
  ('Artificial Intelligence: A Modern Approach', 'Stuart Russell', '9780134610993', 'Pearson',  2020, 'Artificial Intelligence'),
  ('Engineering Mathematics',           'K. A. Stroud',       '9781352010275', 'Red Globe Press',  2020, 'Mathematics')
on conflict do nothing;

-- Three copies of each sample title, with generated accession numbers.
do $$
declare
  b record;
  i integer;
begin
  for b in select id from public.books order by title loop
    for i in 1..3 loop
      insert into public.book_copies (book_id, accession_number, shelf_location)
      values (b.id, public.next_accession_number(), 'A-' || lpad((i)::text, 2, '0'));
    end loop;
  end loop;
end;
$$;
