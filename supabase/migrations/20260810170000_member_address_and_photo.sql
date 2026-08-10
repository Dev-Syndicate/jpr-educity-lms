-- ============================================================================
-- Member postal address, and a private photo.
--
-- ADDRESS
-- One text column, not split into line/city/state/pincode. An Indian postal
-- address is written as a block, nothing in this system filters or sorts by
-- city, and four inputs per member is four chances to leave it half-filled.
-- Splitting it later is a migration; un-splitting guessed data is not.
--
-- PHOTO
-- profiles.photo_path holds the OBJECT PATH in the member-photos bucket, never
-- a URL. A public URL would defeat the private bucket, and a signed URL
-- expires — storing one leaves dead links in the database. The path is
-- durable; the app mints a short-lived signed URL when it renders the image.
--
-- Both are optional: a member is created at the counter in a hurry, and an
-- address or photo can follow later.
-- ============================================================================

alter table public.profiles add column address    text;
alter table public.profiles add column photo_path text;

-- Bounded so a paste cannot write an essay. 500 is generous for an address
-- block; the path is a uuid plus a short extension.
alter table public.profiles
  add constraint profiles_address_len
  check (address is null or length(btrim(address)) between 1 and 500),
  add constraint profiles_photo_path_len
  check (photo_path is null or length(btrim(photo_path)) between 1 and 200);

comment on column public.profiles.address is
  'Postal address as written, one block. Optional.';
comment on column public.profiles.photo_path is
  'Object path in the private member-photos bucket, e.g. "<uuid>.jpg".
   NOT a URL — the app signs a short-lived URL at render time.';

-- ---------------------------------------------------------------------------
-- The member-photos bucket.
--
-- public = false: a member photo identifies a real person at a real college.
-- In a public bucket every student's face is reachable by anyone who guesses
-- a URL, with no sign-in.
--
-- The size and MIME limits live HERE rather than only in the form, because the
-- form is not a boundary — Storage is. A direct API call bypasses the form.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'member-photos',
  'member-photos',
  false,
  2097152,  -- 2 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
   set public             = excluded.public,
       file_size_limit    = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Bucket policies, mirroring the profiles table's own rules.
--
-- Objects are named "<member-uuid>.<ext>", which is what makes a member's own
-- photo expressible as a policy: the owner is derivable from the filename, so
-- it can be compared against auth.uid(). split_part() strips the extension.
--
-- Librarians read and write any photo — checking a face against a card is a
-- counter task. Members READ THEIR OWN ONLY and never write, consistent with
-- members being read-only everywhere else in this system.
-- ---------------------------------------------------------------------------

drop policy if exists member_photos_select_own      on storage.objects;
drop policy if exists member_photos_select_librarian on storage.objects;
drop policy if exists member_photos_write_librarian  on storage.objects;
drop policy if exists member_photos_update_librarian on storage.objects;
drop policy if exists member_photos_delete_librarian on storage.objects;

create policy member_photos_select_own
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'member-photos'
    and split_part(name, '.', 1) = auth.uid()::text
  );

create policy member_photos_select_librarian
  on storage.objects for select
  to authenticated
  using (bucket_id = 'member-photos' and public.is_librarian());

create policy member_photos_write_librarian
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'member-photos' and public.is_librarian());

create policy member_photos_update_librarian
  on storage.objects for update
  to authenticated
  using (bucket_id = 'member-photos' and public.is_librarian())
  with check (bucket_id = 'member-photos' and public.is_librarian());

create policy member_photos_delete_librarian
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'member-photos' and public.is_librarian());
