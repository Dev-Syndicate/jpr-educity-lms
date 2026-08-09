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

**Domain tokens** (beyond the standard shadcn set) — each has a solid, a
`-foreground`, and a `-subtle` background for badges:

| Token | Meaning |
|---|---|
| `available` | copy is on the shelf |
| `issued` | copy is out on loan |
| `overdue` | past its due date — fine accruing |
| `pending` | account awaiting librarian approval |

Use `destructive` for failed actions and irreversible controls, `overdue` for
the circulation state. They are deliberately different tokens.

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
- Members are strictly read-only. No member-facing screen may contain a control
  that mutates data.
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

## Before finishing

```bash
pnpm exec tsc --noEmit    # must pass
pnpm lint
pnpm build                # must compile
```
