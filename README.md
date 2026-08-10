# Jeppiaar Educity — Library Management System

A library management system for the Jeppiaar Educity library. Librarians issue,
return and renew books at a counter using a barcode scanner; members log in
read-only to check their own due dates and fines.

It replaces a hand-written circulation register, so the design goals are
correctness and speed at the counter: every business rule is computed by the
system rather than by mental arithmetic at a busy desk, and a routine issue or
return completes in a single scan.

> **Source of truth.** [`docs/PRD.md`](docs/PRD.md) defines every business rule
> and is authoritative for behaviour. [`docs/database-schema.html`](docs/database-schema.html)
> documents the tables and the constraints that enforce those rules. Read the
> PRD before changing anything the system does.

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Database setup](#database-setup)
- [Project structure](#project-structure)
- [Development](#development)
- [Deployment](#deployment)
- [Contributing](#contributing)

---

## Features

### Circulation counter (librarian)
The primary screen. Optimised for a librarian working through a queue at roughly
one book per second, entirely by keyboard and USB scanner.

- **Single-scan issue and return.** With a member loaded, the next scan issues;
  with no member loaded, the next scan returns. The inferred mode is always
  shown on screen, and an explicit Issue / Return / Renew selector overrides it.
- **Barcode-driven.** Copies are identified by the accession number printed on
  them (e.g. `JPR-00123`). Manual entry also works.
- **Robust against scanner quirks** — the scan field stays focused and clears
  after every scan, and rapid double-fires of the same code are ignored.
- **Legible feedback** — a full-width coloured banner with distinct success and
  failure sounds, readable from a metre away, with an undo on the most recent
  operation.
- **On-shelf lookup** — answer "do we have this book?" without leaving the
  screen, showing available accession numbers or the earliest due date.
- **Approve and issue in one step** — a self-registered member is verified
  against their ID card and issued their first book in a single action.

### Catalogue management
- Titles with author, ISBN, publisher, year, category (book, non-book material,
  project, thesis, proceeding, magazine) and owning department.
- One or more physical **copies** per title, each keyed by its printed
  accession number, with an optional shelf address (row · rack · section).
- Mark copies lost or damaged; retire titles (blocked once ever borrowed, so
  loan history is preserved).

### Members
- Create members at the counter, or **bulk-import from CSV** (up to 500 rows)
  with per-row error reporting.
- Private member photos for ID verification at the counter.
- Search, profile view (loans, history, fines, usage against limit), edit,
  deactivate. Members are never deleted — history is preserved.
- **Public self-registration** (toggleable) into a pending state, approved at
  the counter on first borrow.

### Circulation, fines and settings
- All active loans, filterable by All / Due today / Overdue.
- Fines accrue automatically at a configurable rate per day, freeze on return,
  and are never re-priced retroactively. Collect in full or waive with a
  recorded reason.
- Configurable loan periods, borrowing limits, renewal cap, fine rate, and the
  registration toggle.

### Member portal (read-only)
- Members check their own current loans, due dates, borrowing history and total
  owed, and browse the catalogue with live availability.
- **No control anywhere mutates library data.** The only self-service write is
  changing one's own password.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | [Next.js 16](https://nextjs.org) (App Router, Server Actions, React 19) |
| Language | TypeScript |
| Database & Auth | [Supabase](https://supabase.com) (Postgres + Auth + Storage) |
| UI | [shadcn/ui](https://ui.shadcn.com) on [Base UI](https://base-ui.com), Tailwind CSS v4 |
| Validation | [Zod](https://zod.dev) |
| Charts / tables | Recharts, TanStack Table |
| Package manager | [pnpm](https://pnpm.io) |
| Hosting | Vercel (functions pinned to `bom1`, Mumbai) |

---

## Architecture

Security is enforced at the **database**, never the interface. Every business
rule holds even if someone calls the API directly, because the rules live in
Postgres.

- **Postgres RLS + `security definer` RPCs** are the ground truth. Issue,
  return, renew, fine collection, approval and registration all run as
  transactional functions that re-check the caller and raise human-readable
  errors that surface verbatim in the UI.
- **A Data Access Layer** ([`lib/dal.ts`](lib/dal.ts)) runs at the top of every
  page and every Server Action (`requireLibrarian()` / `requireUser()`). A
  layout check is not a security boundary — layouts do not re-run on client
  navigation.
- **`proxy.ts`** (Next 16's renamed middleware) handles session refresh and an
  optimistic role redirect only. It is never the enforcement point.
- The service-role key is server-only, read exclusively by
  [`lib/supabase/admin.ts`](lib/supabase/admin.ts) (marked `import 'server-only'`).

Key invariants enforced in SQL: a copy can never be on loan twice (a partial
unique index), fines are computed live and frozen on return, and all dates are
computed in India Standard Time via `today_ist()`.

> This project runs Next.js 16, which differs from most Supabase/Next tutorials
> online (middleware is `proxy.ts`, request APIs are async, `params` is a
> Promise, cookies cannot be set during render). See
> [`CLAUDE.md`](CLAUDE.md) and [`AGENTS.md`](AGENTS.md) for the full set of
> constraints before writing code.

---

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org) 20+
- [pnpm](https://pnpm.io) 11+ (this repo pins `pnpm@11.18.0`)
- A [Supabase](https://supabase.com) project
- The [Supabase CLI](https://supabase.com/docs/guides/cli) (installed as a dev
  dependency) for running migrations

> **Use pnpm, never npm or yarn.** The lockfile is `pnpm-lock.yaml`; running
> `npm install` creates a competing `package-lock.json` and desynchronises the
> dependency tree.

### Install and run

```bash
pnpm install
cp .env.example .env.local   # then fill in the Supabase values
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). You will be redirected to
`/login` until a Supabase project is configured and a user exists.

---

## Environment variables

Copy [`.env.example`](.env.example) to `.env.local` and fill in the values from
your Supabase dashboard (**Project Settings → API keys**):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xxxxxxxxxxxx   # publishable (formerly "anon")
SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxxxxxxxxxxx            # secret (formerly "service_role")
```

- `NEXT_PUBLIC_SUPABASE_ANON_KEY` is safe in the browser — it can only do what
  row-level security permits.
- `SUPABASE_SERVICE_ROLE_KEY` **bypasses row-level security** and is server-only.
  Never give it a `NEXT_PUBLIC_` prefix, which would inline it into the browser
  bundle.

---

## Database setup

The schema is defined by ordered migrations in
[`supabase/migrations/`](supabase/migrations/). Apply them with the Supabase CLI:

```bash
pnpm dlx supabase link --project-ref <your-project-ref>
pnpm dlx supabase db push
```

Then complete first-run setup in the Supabase dashboard:

1. **Create the first librarian.** Create a user under **Authentication →
   Users**, then promote them to librarian via SQL (set the role in
   `app_metadata` and `profiles`). Seed **two** librarians so a lost password is
   not a lockout.
2. **Disable public sign-ups** under **Authentication → Providers → Email**
   ("Allow new users to sign up"). All registration goes through the
   `register_member` RPC — SQL and the in-app toggle alone cannot stop
   `auth.signUp()`.
3. **Create the private `member-photos` storage bucket** if member photos are
   used (uploads capped at 2 MB, images only).

After changing the schema, regenerate the TypeScript types:

```bash
pnpm dlx supabase gen types typescript --linked > lib/database.types.ts
```

> **Schema changes are documentation-first and append-only.** Update
> [`docs/database-schema.html`](docs/database-schema.html) (and the PRD if a rule
> changes) **before** writing the migration. Never edit a migration that has
> already run on a shared database — fix mistakes with a new one.

---

## Project structure

```
proxy.ts                     # Session refresh + optimistic role redirect (Next 16's middleware)
app/
  (auth)/                    # login, public register
  (librarian)/               # counter, dashboard, books, members, loans, fines, staff, settings
  (member)/my/               # read-only portal: loans, history, catalogue, password, status
lib/
  supabase/{client,server,admin}.ts   # the three Supabase clients
  dal.ts                     # THE security boundary
  actions/                   # Server Actions (auth, books, members, circulation, fines, ...)
  data/                      # reads, each calling the DAL first
  types.ts, errors.ts, schemas, utils
components/
  ui/                        # shadcn primitives
  counter/                   # scan input, feedback, member slot, recent scans
supabase/migrations/         # ordered, append-only schema migrations
docs/
  PRD.md                     # business rules — source of truth
  database-schema.html       # tables, constraints, ER diagram
```

---

## Development

### Conventions

- App Router at the repo root (`app/`, no `src/`); alias `@/*` → `./*`.
- Reads go through `lib/data/`; mutations are Server Actions in `lib/actions/`
  returning a shared `ActionState` surfaced via `useActionState`.
- UI uses shadcn/ui components only — never hand-write a primitive shadcn
  provides. This project uses **Base UI, not Radix** (custom triggers use the
  `render` prop, not `asChild`).
- All colours are semantic tokens defined in `app/globals.css`. Never hardcode a
  colour or write manual `dark:` overrides.
- Money is rupees, formatted as `₹`. Dates are IST — always `today_ist()` in SQL,
  never `current_date`.

See [`CLAUDE.md`](CLAUDE.md) for the complete conventions, including the shadcn
composition rules and the Next.js 16 gotchas.

### Before committing

```bash
pnpm exec tsc --noEmit    # must pass
pnpm lint
pnpm build                # must compile
```

---

## Deployment

Deployed on Vercel. Functions are pinned to the **`bom1`** (Mumbai) region in
[`vercel.json`](vercel.json) to sit next to the Supabase project in
`ap-south-1` — Vercel's default (`iad1`, US East) puts a cross-continental hop
on every query.

> **If the Supabase project ever moves regions, move `vercel.json` with it.**
> Nothing fails loudly; pages just get slow again.

Set the three environment variables in the Vercel project settings, matching
`.env.local`.

---

## Contributing

This project is developed and maintained by **DevSyndicate**. When contributing:

1. Read [`docs/PRD.md`](docs/PRD.md) before changing behaviour.
2. Follow the conventions in [`CLAUDE.md`](CLAUDE.md) and [`AGENTS.md`](AGENTS.md).
3. For schema changes, update the documentation first, then write an
   append-only migration (see [Database setup](#database-setup)).
4. Ensure `pnpm exec tsc --noEmit`, `pnpm lint` and `pnpm build` all pass before
   opening a pull request.

---

<p align="center"><sub>Built by DevSyndicate for Jeppiaar Educity.</sub></p>
