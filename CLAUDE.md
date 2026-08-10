@AGENTS.md

# Jeppiaar Educity — Library Management System

A library management system for Jeppiaar Educity. Librarians issue, return and
renew books at a counter using a barcode scanner; members log in read-only to
check their own due dates and fines.

**Read [`docs/PRD.md`](docs/PRD.md) before changing behaviour.** It is the
source of truth for every business rule. [`docs/database-schema.html`](docs/database-schema.html)
documents the tables and the constraints that enforce those rules.

---

## Package manager: pnpm

**Always `pnpm`. Never `npm` or `yarn`.** The lockfile is `pnpm-lock.yaml`;
running `npm install` creates a competing `package-lock.json` and desynchronises
the tree.

```bash
pnpm install              # not npm install
pnpm add <pkg>            # not npm install <pkg>
pnpm dlx <cmd>            # not npx
pnpm dev / build / lint
```

---

## UI: shadcn/ui only

**Never hand-write a UI primitive that shadcn already provides.** No bespoke
buttons, inputs, dialogs, tables, badges or dropdowns. Add the official
component instead:

```bash
pnpm dlx shadcn@latest add card        # not npx
pnpm dlx shadcn@latest search <term>   # check before building anything custom
pnpm dlx shadcn@latest docs <name>     # usage + examples
```

The `shadcn` skill is installed at `.agents/skills/shadcn` and carries the full
rule set — consult it when composing UI.

### This project uses Base UI, not Radix

`components.json` sets `"base": "base"`. Custom triggers use the **`render`**
prop, **not** `asChild`:

```tsx
// Correct — Base UI
<DialogTrigger render={<Button>Open</Button>} />

// Wrong — Radix pattern, will not work here
<DialogTrigger asChild><Button>Open</Button></DialogTrigger>
```

**`SelectValue` needs a formatter.** Radix mirrors the selected `SelectItem`'s
children into the trigger; Base UI does **not** — a bare `<SelectValue />`
renders the raw stored value, so an enum shows as `non_book_material`. Pass a
function that maps the value to its label:

```tsx
// Correct — the trigger reads "Non-book material"
<SelectValue>
  {(value: MaterialCategory | null) =>
    value ? MATERIAL_CATEGORY_LABELS[value] : ""
  }
</SelectValue>

// Wrong — the trigger reads "non_book_material"
<SelectValue />
```

Keep the labels in one exported map (see `MATERIAL_CATEGORY_LABELS` in
`lib/types.ts`) rather than repeating the strings in both the trigger and the
items, or the two drift.

**A changing `defaultValue` needs a `key`.** Base UI warns when an uncontrolled
field's default changes after mount:

> A component is changing the default value state of an uncontrolled
> FieldControl after being initialized.

This bites every edit form here, because the actions call `refresh()` and the
new server value flows back into `defaultValue` — which does nothing to a live
input. Key the field on its saved value so a successful save remounts it:

```tsx
<Input key={book?.title ?? ""} defaultValue={book?.title ?? ""} />
```

The same applies to `Collapsible`'s `defaultOpen` and `Select`'s
`defaultValue`. If the value must track server state *while the user is
typing*, the field wants to be controlled instead.

### Composition rules

- Forms use `FieldGroup` + `Field` — never a raw `div` with `space-y-*`.
- Inputs with buttons or icons inside use `InputGroup` + `InputGroupAddon`,
  with `InputGroupInput` (not a raw `Input`).
- Use the full `Card` composition: `CardHeader` / `CardTitle` /
  `CardDescription` / `CardContent` / `CardFooter`.
- `Dialog`, `Sheet` and `Drawer` always need a title, `sr-only` if visually
  hidden.
- Items belong in their group: `SelectItem` in `SelectGroup`, `TabsTrigger` in
  `TabsList`, `CommandItem` in `CommandGroup`.
- `Avatar` always needs `AvatarFallback`.
- Loading buttons compose `Spinner` + `disabled` — `Button` has no `isLoading`.
- Empty states use the `Empty` component.

### Layout, not decoration

- `className` is for layout and spacing only. Never override a component's
  colours or typography.
- No `space-x-*` / `space-y-*` — use `flex` (or `flex flex-col`) with `gap-*`.
- `size-10`, not `w-10 h-10`.
- `truncate`, not `overflow-hidden text-ellipsis whitespace-nowrap`.
- No manual `z-index` on overlays; they manage their own stacking.
- Conditional classes go through `cn()`.

---

## Theme: one source of truth

**Every colour lives in `app/globals.css` and nowhere else.** Changing a token
there restyles the entire application. That property is the point — do not
break it.

```tsx
// Correct — semantic tokens
<div className="bg-card text-muted-foreground border-border">
<Badge className="bg-overdue-subtle text-overdue">Overdue</Badge>

// WRONG — hardcoded colours, invisible to the theme
<div className="bg-white text-gray-500 border-gray-200">
<span className="text-red-600">Overdue</span>
<div style={{ color: "#7a1f2b" }}>
```

**Rules:**

- Never write a raw colour anywhere: no `bg-red-500`, no `#7a1f2b`, no
  `rgb()`, no `text-white`, no inline `style` colours.
- Never write manual `dark:` colour overrides. Tokens already carry both
  themes; `dark:bg-slate-800` defeats the system.
- If a needed colour is missing, **add a token** to `:root` *and* `.dark` in
  `globals.css`, register it in `@theme inline`, then use it. Never hardcode at
  the call site.
- A token added to `:root` but not `.dark` silently keeps its light value in
  dark mode and breaks contrast. Always define both.

**Brand palette** — taken from the Jeppiaar Educity crest: deep forest green
with gold.

| Token | Use |
|---|---|
| `primary` | forest green on light, gold on dark — main actions |
| `brand-deep` | the crest's darkest green — headers, sidebar, hero panels |
| `gold` | crest gold — **only on dark green grounds** |
| `gold-ink` | darkened gold — the only gold safe as text on light surfaces |

> **Never put raw `gold` on a white background.** The crest gold scores 2.1:1
> against white, well under the 4.5:1 minimum — it is effectively unreadable.
> Use `text-gold-ink` (5.05:1) on light surfaces, and reserve `text-gold` for
> dark green grounds like the sidebar (7.4:1).

**Domain tokens** — each has a solid, a `-foreground`, and a `-subtle`
background for badges:

| Token | Meaning |
|---|---|
| `available` | copy is on the shelf (teal — deliberately *not* the brand green) |
| `issued` | copy is out on loan |
| `overdue` | past its due date — fine accruing |
| `pending` | account awaiting approval (orange — deliberately *not* the brand gold) |

Use `destructive` for failed actions and irreversible controls, `overdue` for
the circulation state. They are deliberately different tokens.

Status colours are kept away from the brand hues on purpose: an "available"
badge in the brand green, or a "pending" badge in the brand gold, would read as
decoration rather than information.

---

## Next.js 16 — differs from most tutorials

The bundled docs in `node_modules/next/dist/docs/` are authoritative. The traps
that bite hardest:

- **`middleware.ts` does not exist.** It is `proxy.ts` at the project root,
  exporting a function named `proxy`. Setting `export const runtime` inside it
  **throws** — proxy is always Node.js.
- **Request APIs are async:** `await cookies()`, `await headers()`. `params`
  and `searchParams` are Promises.
- **Page/layout props use generated global types**, never imported:
  `function Page(props: PageProps<'/books/[id]'>)`, then
  `const { id } = await props.params`.
- **Cookies cannot be set during render.** It throws at runtime and TypeScript
  will not catch it. The Supabase server client's `setAll` must be wrapped in
  try/catch; session refresh belongs in `proxy.ts`.
- **`revalidateTag` needs two arguments** — `revalidateTag('books', 'max')`.
  The single-argument form is a TS error. `revalidatePath` requires the second
  argument for dynamic paths: `revalidatePath('/books/[id]', 'page')`.
  `cacheComponents` is off, so prefer **`refresh()`** after mutations.
- **Server Actions dispatch one at a time per client** — never `Promise.all`
  them.
- Turbopack is the default; a `webpack` key in `next.config.ts` fails the build.

---

## Changing the database schema

**`docs/database-schema.html` is updated FIRST, before any SQL is written.**

Adding a table or column, changing a constraint, altering a relationship,
adding an enum value — the documentation changes first, then the migration
follows it. Never the other way round, and never SQL alone.

Order of work:

1. Update [`docs/database-schema.html`](docs/database-schema.html) — the table
   card, and the ER diagram if a relationship changed.
2. Update [`docs/PRD.md`](docs/PRD.md) if a business rule changed with it.
3. Write the migration in `supabase/migrations/`.
4. Verify the SQL matches what the document now claims.

Rationale: the diagram is how anyone new understands this system. A schema
change that skips it leaves the documentation quietly wrong, and a wrong
diagram is worse than none — people trust it and build on a false picture.
Writing the doc first also forces the design decision to be made before the
DDL, rather than reverse-engineered from whatever got typed.

Migrations are **append-only** once applied to a shared database. Fix a
mistake with a new migration, never by editing one that has already run.

---

## Security: the database is the boundary

The UI is never the enforcement point. Business rules live in Postgres
(`security definer` RPCs + row-level security), so they hold even when someone
calls the API directly.

- Every page and every Server Action starts with a Data Access Layer check
  (`requireLibrarian()` / `requireUser()`). A layout check is **not** a
  security boundary — layouts do not re-run on client navigation.
- Always `supabase.auth.getUser()`, never `getSession()` server-side
  (`getSession` is an unverified local decode).
- `SUPABASE_SERVICE_ROLE_KEY` is server-only. It never gets a `NEXT_PUBLIC_`
  prefix, and only `lib/supabase/admin.ts` (marked `import 'server-only'`)
  touches it.
- Members are strictly read-only **with respect to library data**. No
  member-facing screen may contain a control that mutates a book, copy, loan,
  fine, or an account's standing. The single exception is `/my/password`, which
  writes to the member's own Supabase auth account and nothing else — it
  re-verifies the current password server-side before changing it. Adding a
  second exception needs the same justification: it must touch only the
  caller's own credentials.
- Never trust a client-supplied `role`, `account_status` or `member_type`.

---

## Conventions

- App Router at root `app/` (no `src/`). Alias `@/*` → `./*`.
- Route groups: `(auth)`, `(librarian)`, `(member)`.
- Mutations are Server Actions in `lib/actions/`, returning a shared
  `ActionState` surfaced via `useActionState`.
- Reads go through `lib/data/`, which call the DAL first.
- Money is rupees — format as `₹` consistently.
- Dates are IST. In SQL always use `today_ist()`, never `current_date`.

## Latency: the database is a network call away

The Supabase project is in **Mumbai** (`ap-south-1`), so `vercel.json` pins
functions to **`bom1`**. Vercel's default is `iad1` (US East), which puts a
cross-continental hop on every query. **If the Supabase project ever moves,
move this with it** — nothing fails loudly, pages just get slow again.

Because every round trip is expensive, two rules matter:

- **Never `await` independent queries in sequence.** Use `Promise.all`. This
  applies to reads only — Server Actions still dispatch one at a time.
- **Every route that fetches data needs a `loading.tsx`.** Without one Next
  cannot stream, so the browser sits on the *previous* page for the whole
  server render and the click feels dead. Compose `ListSkeleton` for the
  standard toolbar-plus-table shape; match the real layout so nothing jumps.

`getCurrentUser()` runs on every page. It fetches the session and the profile
concurrently via the `current_profile()` RPC, which resolves `auth.uid()`
inside Postgres so there is no id to wait for. That RPC is a latency
optimisation and **not** an authentication step — the token is still verified
independently through `getUser()`, and the returned row's id is re-checked
against it.

## Before finishing

```bash
pnpm exec tsc --noEmit    # must pass
pnpm lint
pnpm build                # must compile
```
