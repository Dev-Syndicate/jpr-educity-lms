# Supabase setup

One-time steps to bring a fresh Supabase project up. Do them in order.

---

## 1. Project settings

When creating the project:

| Setting | Value | Why |
|---|---|---|
| Region | **Asia-Pacific** | Closest to Chennai — lowest latency |
| Enable Data API | **On** | The app uses `supabase-js` |
| Automatically expose new tables | **Off** | Tables are exposed deliberately, by the grants in migration 6 |
| Enable automatic RLS | **On** | Safety net — a future table can't be left open by accident |

Save the database password somewhere safe. Supabase will not show it again.

---

## 2. Turn OFF Supabase sign-ups — required

**Authentication → Sign In / Providers → Email → uncheck "Allow new users to sign up".**

This is not optional. All registration goes through `register_member()`, which
checks the `public_registration` toggle and forces new accounts into `pending`.
If Supabase's own sign-up stays enabled, anyone can call `auth.signUp()`
directly and get an account that skips the approval step entirely.

While you are there, if no SMTP server is configured:

**Authentication → Providers → Email → disable "Confirm email"**

Otherwise librarian-created accounts cannot log in until someone clicks a
verification link that is never delivered.

---

## 3. Run the migrations

### Using the CLI (recommended)

```bash
# 1. Authorise this machine. Opens a browser.
pnpm dlx supabase login

# 2. Find the project reference id (20-char string).
pnpm dlx supabase projects list

# 3. Link this folder to the project.
#    Prompts for the DATABASE PASSWORD from project creation.
#    Lost it? Project Settings -> Database -> Reset database password.
pnpm dlx supabase link --project-ref <your-project-ref>

# 4. Apply all migrations, in filename order.
pnpm dlx supabase db push
```

Useful afterwards:

```bash
pnpm dlx supabase migration list          # what has been applied
pnpm dlx supabase db push --dry-run       # preview without applying
pnpm dlx supabase projects api-keys --project-ref <ref>
pnpm dlx supabase gen types typescript --linked > lib/database.types.ts
```

`supabase login` stores an access token on this machine — anything with shell
access can then reach the project. `supabase logout` clears it.

### Known CLI bug: `link` fails on "failed to get api keys"

CLI 2.112.0 ends `link` with:

```
failed to get api keys: SchemaError(Expected a string matching the RegExp ... at [2]["inserted_at"])
```

A CLI bug parsing a timestamp in the API-keys response — nothing wrong with the
project. But the link does **not** complete: the CLI crashes before writing
`supabase/.temp/project-ref`, so `db push` then reports
`Cannot find project ref`.

Three ways past it, cheapest first:

```bash
# 1. Write the ref file yourself — it is just the bare ref, no newline needed.
printf 'tajygumpwncgvuukjpio' > supabase/.temp/project-ref
pnpm dlx supabase db push

# 2. Or pass the ref explicitly each time.
pnpm dlx supabase db push --project-ref tajygumpwncgvuukjpio

# 3. Or bypass project lookup entirely with a direct connection string
#    (Project Settings -> Database -> Connection string -> URI).
pnpm dlx supabase db push --db-url "postgresql://postgres.<ref>:<password>@<host>:6543/postgres"
```

For the API keys, use the dashboard (**Project Settings → API**) rather than
`supabase projects api-keys`, which hits the same broken endpoint.

### Or by hand

Paste each file into the SQL Editor **in filename order**. Order matters:
helpers reference tables, policies call helpers, RPCs call everything.

### What the CLI cannot do

Two required steps have no CLI equivalent and must be done in the dashboard:

- **Disabling email sign-up** (step 2 above) — the security step that stops
  `auth.signUp()` bypassing the approval queue.
- **Creating the first librarian user** (step 4 below).

---

## 4. Create the first librarian

`register_member` can only ever produce a pending *member*, and approving one
requires an existing librarian — so the first account is made by hand.

**Authentication → Users → Add user → Create new user.** Enter an email and
password, and tick **Auto Confirm User**.

Then in the SQL Editor, promote them:

```sql
update public.profiles
   set role           = 'librarian',
       member_type    = null,          -- librarians have no member_type
       account_status = 'active',
       is_active      = true,
       full_name      = 'Head Librarian'
 where email = 'librarian@example.com';   -- the address you just used
```

Verify:

```sql
select full_name, role, account_status from public.profiles;
```

**Create a second librarian the same way.** With only one, a forgotten password
means nobody can approve members or issue books until someone edits the
database by hand.

---

## 5. Get the API keys

**Project Settings → API**. Put them in `.env.local` (gitignored):

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
```

The service role key bypasses RLS entirely. It must never get a
`NEXT_PUBLIC_` prefix and must never reach the browser.

---

## 6. Check it works

```sql
-- Settings singleton exists
select * from public.settings;

-- Sample catalogue loaded, with accession numbers
select b.title, c.accession_number, c.status
  from public.book_copies c
  join public.books b on b.id = c.book_id
 order by c.accession_number
 limit 5;

-- IST date is correct (important between 00:00 and 05:30 IST)
select public.today_ist() as ist_today, current_date as utc_today;
```

Then, signed in as the librarian, try a full cycle:

```sql
-- Issue (use a real member id and a real accession number)
select * from public.issue_book('JPR-00001', '<member-uuid>');

-- Make it overdue to test the fine
update public.loans set due_date = public.today_ist() - 5
 where copy_id = (select id from public.book_copies where accession_number = 'JPR-00001');

-- Should show Rs 5 outstanding
select book_title, days_overdue, fine_outstanding
  from public.v_loans_with_fine where accession_number = 'JPR-00001';

-- Renewal must be REFUSED while the fine is unpaid
select * from public.renew_loan('<loan-uuid>');
```
