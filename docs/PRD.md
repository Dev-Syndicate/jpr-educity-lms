# Product Requirements Document
# Jeppiaar Educity — Library Management System (JPR Educity LMS)

| | |
|---|---|
| **Document status** | Draft for approval |
| **Date** | 9 August 2026 |
| **Owner** | Jeppiaar Educity Library |
| **Version** | 1.0 |

> **Note on this document.** This PRD defines *what* is being built and *why*. The implementation plan (stack decisions, database schema, build sequence) follows in the Appendix, so engineering can start from the same file.

---

## 1. Overview

### 1.1 Problem

The Jeppiaar Educity library currently records circulation by hand in a physical register. This creates four recurring problems:

- **No reliable due-date tracking.** Finding out which books are overdue means reading the register line by line.
- **Fines are inconsistently applied.** Days-late arithmetic is done mentally at a busy counter, so the ₹1/day rule is applied unevenly.
- **Students cannot check their own status.** The only way to know a due date or an amount owed is to ask at the counter.
- **No visibility into the collection.** Nobody can quickly answer "how many copies of this title do we have, and how many are out?"

### 1.2 Solution

A web-based library management system with two audiences:

- **Librarians** — a counter-facing workstation for issuing, returning and renewing books via barcode scan, plus catalogue, member and fine management.
- **Members** (students and faculty) — a read-only portal to check their own loans, due dates and outstanding fines from any device.

### 1.3 Goals

| Goal | Measure of success |
|---|---|
| Eliminate manual due-date calculation | Every loan has a system-computed due date; zero manual arithmetic at the counter |
| Apply the fine rule consistently | Fines computed automatically at ₹1/day; no discretionary calculation |
| Speed up the counter | A routine issue or return completes in a single barcode scan |
| Give members self-service visibility | Students can check due dates and fines without visiting the library |
| Make the collection queryable | Availability of any title visible instantly |

### 1.4 Non-goals (explicitly out of scope for v1)

- Reservations, holds, or waitlists for books that are out
- Email or SMS notifications and overdue reminders
- Fine payment online — all payment is cash at the counter
- Inter-library loans, acquisitions, or purchase workflows
- Digital/e-book lending
- Reading history analytics or recommendations
- Mobile native apps (the web app is responsive; that is sufficient)

---

## 2. Users and roles

The system has exactly **two roles**.

### 2.1 Librarian
Library staff who operate the counter. A librarian can do everything: issue, return, renew, collect and waive fines, manage the catalogue, create member accounts, create other librarian accounts, and change system settings.

### 2.2 Member
Anyone who borrows books. A member has one of two **member types**, which differ only in borrowing limit:

- **Student** — may hold up to 3 books *(default; editable in Settings)*
- **Staff** — college faculty who borrow books, may hold up to 5 books *(default; editable in Settings)*

Both limits are **configurable by the librarian** — see §3.4. The numbers above are the values the system ships with, not fixed rules.

> **Terminology warning.** "Staff" here means *teaching faculty who borrow books*. It does **not** mean library staff. Library staff are **librarians**. This distinction matters throughout the system.

**Members are strictly read-only.** They can look, but they cannot take any action that changes data — no self-renewal, no reservations, no profile edits.

### 2.3 Account creation

There are **two ways** a member account comes into existence. Both end with a librarian deciding that the person is genuinely enrolled.

#### Path A — the librarian adds the member directly
The librarian enters the member's details at the counter. The account is **active immediately** and can borrow straight away. This path is always available and is never affected by the toggle below.

#### Path B — the member registers themselves, and is approved at the counter
When public registration is switched on, a prospective member can fill in a registration form. The account is created in a **`pending`** state:

- A pending account **can log in**, but sees only a "waiting for approval" message.
- A pending account **cannot borrow anything**.
- **Approval happens at the counter, on first borrow.** When the member turns up with a book, the librarian searches their name or roll number, sees the pending record, checks their college ID against the declared details, and approves and issues in one step.
- Once approved the account is active, and every later visit is an ordinary issue with no extra step.

> **Why approval is not a batch queue.** Reviewing hundreds of registrations in the abstract is both a chore nobody completes and a poor check — the librarian has no way to confirm a stranger is enrolled from a form alone. Doing it at the counter means verification happens at the one moment the person is physically present with an ID card, and only for members who actually borrow. Registrations from people who never visit simply stay pending, costing nothing.

**Librarian accounts are only ever created by another librarian.** Public registration creates members exclusively — it can never produce a librarian account. The first librarian is created manually during setup.

#### The public registration toggle

A single setting, **Public registration**, controls whether the registration page is reachable:

| Toggle | Effect |
|---|---|
| **ON** | The registration page is live. Anyone with the link can apply, and lands in the pending queue. |
| **OFF** | The registration page returns "Registration is closed — please visit the library counter." No new applications can be submitted. |

The librarian can add members either way. The intended use is to switch registration on at the start of term and off once enrolment settles.

#### What the applicant provides

Full name, roll/staff number, personal email, department, **declared member type** (student or faculty), and a password of their choosing.

> **The librarian must verify the declared member type, not just the roll number.** Member type sets the borrowing limit — faculty may hold 5 books against a student's 3. An applicant who falsely claims faculty status gets extra books, so approval means confirming *both* that the person is enrolled *and* that they are who they say they are.

#### Rejection

A rejected application is **marked rejected and kept on record**, not deleted:

- The email address stays claimed, so the same person cannot quietly re-apply and slip through on a second attempt.
- The librarian may record a reason (e.g. "no such roll number in college records").
- Rejected accounts cannot log in, cannot borrow, and are excluded from member search.
- A librarian can reverse a rejection if it was a mistake.

**Rationale:** self-registration removes the typing burden at the start of term, but a library lends physical property — a fake account walks out with real books. The pending queue means no account can borrow until a person has confirmed enrolment, which is the check that actually matters.

### 2.4 Email addresses

Members log in with their **own personal email address** — the Gmail (or similar) address they already use. It is recorded by the librarian (Path A) or entered by the applicant (Path B).

- **No synthetic or placeholder addresses.** Every account uses a real, working inbox the member controls.
- **Email is the login identifier** and must be unique across the system. Attempting to reuse an address already registered is rejected with a clear message.
- **The roll number / staff number is the identifier used at the counter** for searching and identifying members — not the email.
- Because the address is real and reachable, members **can reset their own password** without librarian intervention.
- If a member changes their personal email, the librarian updates it on their profile.

---

## 3. Core business rules

These rules are the heart of the system. They are enforced at the **database layer**, so they hold regardless of how the system is accessed — they cannot be bypassed through the interface.

### 3.1 Borrowing

| Rule | Value | Configurable |
|---|---|---|
| Loan period | 15 days | Yes |
| Maximum books — student | 3 | Yes |
| Maximum books — staff | 5 | Yes |

- A loan is against a **specific physical copy**, identified by its accession number — not against a title.
- A copy that is already on loan cannot be issued again.
- An inactive member cannot borrow.
- A member at their limit cannot borrow until they return something.

### 3.2 Renewal

| Rule | Value | Configurable |
|---|---|---|
| Maximum renewals per loan | 2 | Yes |
| New due date on renewal | Renewal day + 15 days | Yes (follows loan period) |

- Renewal is performed by the **librarian at the counter**. The member brings the book, the librarian clicks Renew. Members cannot renew themselves.
- Renewal sets the due date to **the day of renewal + 15 days** — not the old due date + 15.
- **An overdue book cannot be renewed while a fine is unpaid.** The librarian must collect (or waive) the fine first, then renew.

### 3.3 Fines

| Rule | Value | Configurable |
|---|---|---|
| Fine rate | ₹1 per day | Yes |
| Accrual starts | The day **after** the due date | — |
| Accrual ends | The day the book is returned | — |

- No fine accrues on or before the due date.
- A fine grows daily while the book is out, and is **frozen** at its final value when the book is returned.
- **Changing the fine rate must not re-price historical fines.** A fine assessed at ₹1/day stays at that amount even if the rate later changes to ₹2/day.
- Fines are paid in **cash at the counter**; the librarian records the payment.
- **Part payment is not accepted.** A fine is paid in full or waived.
- A librarian **may waive** a fine but **must record a written reason**. Who waived it, when, and why are permanently stored.

#### Worked example

```
Borrowed        1 Aug        Due 16 Aug
Renewed        14 Aug        Due 29 Aug   (renewal day + 15)
Returned        3 Sep        5 days late
Fine = 5 × ₹1 = ₹5
```

#### Blocked-renewal example

```
Due 16 Aug · today is 26 Aug · ₹10 accrued
  [ Renew ]  →  blocked
  "Collect ₹10 outstanding before renewing."
  [ Collect ₹10 ]  →  then  [ Renew ]  →  new due date 10 Sep
```

### 3.4 Configurable settings

A librarian can edit these in-app. Defaults:

| Setting | Default |
|---|---|
| Loan period | 15 days |
| Fine per day | ₹1 |
| Maximum renewals | 2 |
| Maximum books — student | 3 |
| Maximum books — staff | 5 |
| **Public registration** | **Off** |

**Settings are not retroactive.** Changing the loan period does not move the due date of loans already issued. The settings screen must state this clearly.

---

## 4. Functional requirements

### 4.1 The counter (primary librarian screen)

This is the most-used screen in the system and the one the product is judged on. A librarian works through a queue at roughly one book per second and does not look at the mouse.

**Requirements:**

| ID | Requirement |
|---|---|
| C-1 | Books are identified by scanning the accession number barcode (e.g. `JPR-00123`) with a USB scanner, which types the code and presses Enter. Manual typing must also work. |
| C-2 | The operation mode is **inferred, not selected**: if a member is loaded, the next scan **issues** to them; if no member is loaded, the next scan **returns** that copy. |
| C-3 | An explicit Issue / Return / Renew override is available for when inference is wrong, but the common path requires **zero clicks**. |
| C-4 | After a successful issue, the member stays loaded so the next book can be scanned immediately. A clear "next member" action resets. |
| C-5 | The scan field is always focused — on load, after every operation, and when focus is lost. |
| C-6 | The field clears after **every** scan, successful or failed, so consecutive scans cannot concatenate. |
| C-7 | Repeated scans of the same code within ~1 second are ignored (scanners double-fire). |
| C-8 | Result feedback is legible from a metre away — full-width coloured banner showing book title, member name and new due date, with distinct success and failure sounds. |
| C-9 | Success **never** opens a modal dialog, which would cost a keystroke per book. |
| C-10 | The last 10 operations are listed, with an undo action on the most recent. |
| C-11 | Rule violations show the specific reason ("Arun already has 3 books issued"), never a generic error. |
| C-12 | Counter member search finds **pending** members as well as active ones, clearly marked as pending. |
| C-13 | Selecting a pending member shows everything they declared at registration — name, roll number, department, email — with the **declared member type highlighted**, since it sets the borrowing limit. A prompt reminds the librarian to check the college ID card. |
| C-14 | **Approve and issue in one action.** The librarian confirms the person, and the scanned book is issued in the same step. |
| C-15 | Rejecting from the counter is also available, for someone who cannot prove enrolment. |
| C-16 | Once approved, the member is ordinary — no further approval prompts on later visits. |

### 4.2 Catalogue management (librarian)

| ID | Requirement |
|---|---|
| B-1 | Add, edit and view books with title, author, ISBN, publisher, year and category. |
| B-2 | Search the catalogue by title, author or ISBN. |
| B-3 | A book has one or more **physical copies**, each with a unique accession number in the format `JPR-00123`. |
| B-4 | Add copies in bulk, with accession numbers generated automatically. |
| B-5 | Mark a copy as lost or damaged. A lost copy's open loan is closed and its fine frozen. |
| B-6 | A copy currently on loan cannot be retired or deleted. |
| B-7 | Book detail shows every copy, its status, and who currently holds it. |

### 4.3 Member management (librarian)

| ID | Requirement |
|---|---|
| M-1 | Create a member account: full name, roll/staff number, member type, department, email, contact number. |
| M-2 | Search members by name or roll number. |
| M-3 | View a member's profile: current loans with due dates, full borrowing history, fines, and current usage against their limit (e.g. "2 of 3 books"). |
| M-4 | Edit a member's details. |
| M-5 | Deactivate a member. A deactivated member cannot borrow. **Members are never deleted** — history is preserved. |
| M-6 | Deactivation is blocked while the member holds books. |
| M-7 | The member list shows **active members** by default, with filters for pending and rejected. |

### 4.3a Registrations list (librarian)

Approval normally happens at the counter (C-12 … C-16). This screen exists for browsing and housekeeping, **not** as a task queue.

| ID | Requirement |
|---|---|
| A-1 | A list of self-registered accounts, filterable by pending / rejected. |
| A-2 | **No count badge and no unread indicator** in the navigation. A large pending count is the expected steady state, not a backlog to clear. |
| A-3 | The screen states plainly that pending members are approved when they first borrow, and that no action is required here. |
| A-4 | Approve or reject from this screen too, for a librarian who prefers to work ahead. |
| A-5 | Rejections are recorded with an optional reason and kept, not deleted. |
| A-6 | A rejection made in error can be reversed. |
| A-7 | A registration whose roll number matches an existing member is flagged as a possible duplicate. |

### 4.4 Circulation records (librarian)

| ID | Requirement |
|---|---|
| L-1 | View all active loans, filterable by All / Due today / Overdue. |
| L-2 | Each loan shows the copy, title, member, issue date, due date, days remaining or overdue, and renewals used. |
| L-3 | Renew or return directly from this list. |

### 4.5 Fines (librarian)

| ID | Requirement |
|---|---|
| F-1 | List all outstanding fines by member with amount and days overdue. |
| F-2 | Collect a fine in full, recording who collected it and when. |
| F-3 | Waive a fine, **requiring** a written reason; store who waived it and when. |
| F-4 | View fine history for a member. |

### 4.6 Staff accounts (librarian)

| ID | Requirement |
|---|---|
| S-1 | View all librarian accounts. |
| S-2 | Create a new librarian account, with a confirmation step noting it grants full access. |
| S-3 | A librarian cannot deactivate their own account (prevents lockout). |
| S-4 | The **last active** librarian cannot be deactivated — that would leave the library with no way in for anyone. |
| S-5 | A deactivated librarian loses access immediately, enforced at the database and not only in the app. |

### 4.7 Member portal (read-only)

| ID | Requirement |
|---|---|
| P-1 | Members log in with email and password. |
| P-2 | View own current loans: title, issue date, due date, days remaining or overdue, and fine accrued. |
| P-3 | A prominent total of any amount owed, with a note that payment is made at the counter. |
| P-4 | View own borrowing history. |
| P-5 | Browse and search the catalogue, seeing availability counts (e.g. "2 of 3 available"). |
| P-6 | **No action is available anywhere.** No renew, no reserve, no profile edit. Overdue items are shown informationally with "please return at the library counter". |
| P-7 | A member can never see another member's data. |
| P-8 | A **pending** member sees only a "your registration is awaiting approval" message — no catalogue, no loans, nothing else. |
| P-9 | A **rejected** member cannot log in at all, and is told to visit the library counter. |

### 4.7a Public registration (prospective member)

| ID | Requirement |
|---|---|
| R-1 | A registration page, reachable only while **Public registration** is switched on. |
| R-2 | Collects full name, roll/staff number, personal email, department, declared member type, and a password. |
| R-3 | Rejects an email address or roll number already in use, with a clear message. |
| R-4 | On submission the account is created as **pending** and the applicant is told approval is required. |
| R-5 | While registration is off, the page states that registration is closed and directs the applicant to the counter. |
| R-6 | Registration can **never** create a librarian account, regardless of what is submitted. |

### 4.8 Dashboard (librarian)

| ID | Requirement |
|---|---|
| D-1 | At-a-glance counts: issued today, returned today, currently overdue, total fines outstanding. |
| D-2 | A list of overdue books with member names. |
| D-3 | A direct link to the counter screen. |

---

## 5. User stories

**As a librarian at the counter…**
- …I scan a student's ID and then a book barcode, and the book is issued with the due date shown, so I can serve the next person immediately.
- …I scan a returned book with no member loaded, and it is returned and any fine calculated automatically.
- …when a student wants to keep a book longer, I click Renew and the new due date is set to 15 days from today.
- …when a student tries to borrow a fourth book, I am told immediately that they already have three.
- …when an overdue book is brought for renewal, I am told the fine must be collected first, and how much.
- …when a student who registered online comes to borrow for the first time, I search their roll number, check their ID card against what they entered, and approve and issue in one step — without leaving the counter screen.

**As a librarian managing the library…**
- …I add a new title and create five copies at once, with accession numbers generated for me.
- …I register a new student at the start of term and hand them their login.
- …I check which books are overdue so I can follow up.
- …I waive a fine for a student on medical leave, recording why.

**As a student…**
- …I check from my phone when my books are due, without going to the library.
- …I see that I owe ₹4 and know to bring cash to the counter.
- …I search the catalogue to see whether a title is available before walking over.

---

## 6. Non-functional requirements

### 6.1 Security

Security is enforced at the **database**, not the interface. Even a user calling the API directly, bypassing the app entirely, is subject to every rule.

| ID | Requirement |
|---|---|
| SEC-1 | A member can read **only their own** profile, loans and fines. |
| SEC-2 | A member cannot write anything, anywhere. |
| SEC-3 | A member cannot change their own role or member type — blocked by two independent mechanisms. |
| SEC-4 | Every business rule (limits, fines, fine-before-renew) is enforced in the database, not only in the UI. |
| SEC-5 | Administrative credentials never reach the browser. |
| SEC-6 | Public registration can only ever create a **pending member**. It can never create a librarian, and can never create an already-active account, regardless of what is submitted. |
| SEC-7 | Every privileged operation re-verifies the caller is a librarian at the point of execution. |
| SEC-8 | Fine collection and waiver record the acting librarian for accountability. |
| SEC-9 | A pending or rejected account cannot borrow, cannot be issued a book by any means, and cannot read catalogue or loan data. |
| SEC-10 | An applicant cannot set their own approval status, role, or borrowing limit — those fields are ignored on submission and set only by a librarian. |
| SEC-11 | While the registration toggle is off, registration is rejected **at the database**, not merely hidden in the interface. |
| SEC-12 | An applicant can only complete **their own** registration. Passing another person's user id is refused. |

> **Operational dependency for public registration.** The in-app toggle is
> necessary but not sufficient: Supabase's own **Authentication → Sign In /
> Providers → "Allow new users to sign up"** must also be enabled, because
> `auth.signUp()` is the only way an anonymous person can create an account.
> With it off, `/register` returns *"Signups not allowed for this instance"*
> however the in-app toggle is set.
>
> Leaving the provider setting **off** is a valid deployment choice — it makes
> the library counter the only way in, and the in-app toggle then has no
> effect. Turn the provider setting on only when public registration is
> genuinely wanted; the in-app toggle remains the day-to-day control.

### 6.2 Usability

| ID | Requirement |
|---|---|
| U-1 | The counter screen is operable **entirely by keyboard and scanner**. |
| U-2 | Error messages state the specific reason and what to do next. |
| U-3 | Every list has a defined empty state; no blank screens. |
| U-4 | The member portal works on a phone. |
| U-5 | Currency is displayed consistently as ₹. |

### 6.3 Data integrity

| ID | Requirement |
|---|---|
| DI-1 | The same copy can never be on loan to two members simultaneously, even under concurrent scans. |
| DI-2 | Copy availability status can never drift out of sync with loan records. |
| DI-3 | All dates are calculated in **India Standard Time**. A book returned in the morning must never be counted as returned the previous day. |
| DI-4 | Historical fines are immutable once assessed. |
| DI-5 | Member and loan history is never deleted. |

---

## 7. Acceptance criteria

The system is accepted when every one of the following passes.

### Circulation
- [ ] Issuing a 4th book to a student is refused with "already has 3 books issued".
- [ ] Issuing a 6th book to staff is refused; the 5th succeeds.
- [ ] Issuing an already-issued copy is refused with a clear message.
- [ ] Issuing to a deactivated member is refused.
- [ ] Returning a copy makes it immediately available.
- [ ] A third renewal is refused when the maximum is 2.
- [ ] Renewal sets the due date to today + 15 days, not old due date + 15.

### Fines
- [ ] A book returned on its due date incurs **no** fine.
- [ ] A book 5 days late incurs exactly ₹5.
- [ ] An outstanding overdue book shows a fine that increases each day.
- [ ] Renewing an overdue book with an unpaid fine is **refused**.
- [ ] After collecting the fine, the same renewal succeeds.
- [ ] Changing the fine rate to ₹2/day leaves already-assessed fines unchanged.
- [ ] Waiving a fine without a reason is refused.
- [ ] A waived fine records who waived it, when, and why.

### Security
- [ ] A member querying loans directly receives only their own records.
- [ ] A member attempting to issue a book directly is refused.
- [ ] A member attempting to set their own role to librarian is refused.
- [ ] No administrative credential appears anywhere in the browser bundle.
- [ ] No member-facing screen contains any control that modifies data.

### Registration and approval
- [ ] With the toggle **off**, submitting a registration directly to the API is rejected.
- [ ] With the toggle **on**, a registration creates a **pending** account, never an active one.
- [ ] A registration submitting `role=librarian` still produces a plain pending member.
- [ ] A registration submitting an already-active status still produces a pending account.
- [ ] A pending member cannot be issued a book by any direct API call.
- [ ] A pending member cannot read the catalogue or any loan data.
- [ ] A rejected applicant cannot log in, and their email remains claimed.
- [ ] Registering with an existing email or roll number is refused with a clear message.

### Approval at the counter
- [ ] Counter search finds a pending member and marks them clearly as pending.
- [ ] The pending record displays the declared member type prominently before approval.
- [ ] "Approve and issue" approves the member and issues the scanned book in one action.
- [ ] After approval, a second issue to the same member needs no approval step.
- [ ] Rejecting from the counter records the decision and prevents borrowing.
- [ ] The navigation shows **no count badge** for pending registrations.

### Counter usability
- [ ] A complete issue is possible with a member loaded and one scan.
- [ ] A complete return is possible with one scan and no other input.
- [ ] The scan field regains focus automatically after every operation.
- [ ] Two rapid scans of the same barcode produce one operation.
- [ ] A rule violation displays the specific reason.

### Timezone
- [ ] At 01:00 IST the system reports the correct Indian date, and fine counts do not slip by a day.

---

## 8. Open questions

| # | Question | Impact if unresolved |
|---|---|---|
| ~~Q1~~ | ~~Does every student have a college email address?~~ **RESOLVED:** members register with their own **personal email address** (Gmail, etc.). No synthetic or institutional addresses. See §2.4. | Closed |
| Q2 | Should the fine rate or loan period differ for staff vs students? Currently only the book limit differs. | Minor schema addition if yes |
| Q3 | Is a printed fine receipt required at the counter? | Small additional screen |
| Q4 | Roughly how many titles, copies and members should the system expect? | Informs pagination and search tuning |

---
---

# Appendix — Implementation Plan

## A1. Current state

The repository is a bare `create-next-app` scaffold. There is **no application code, no database, and no initialised git repository**. Everything is built from zero.

## A2. Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16.3.0 (App Router, Server Actions) |
| UI | shadcn/ui on Tailwind CSS v4 |
| Database & Auth | Supabase (Postgres + Auth) |
| Language | TypeScript |
| Package manager | pnpm |

## A3. Critical technical constraints

This project runs **Next.js 16.3.0**, which differs from almost every Supabase/Next tutorial online. These were verified against the bundled docs in `node_modules/next/dist/docs/`. Violating any of them produces runtime failures TypeScript will not catch.

1. **`middleware.ts` does not exist.** It is renamed to **`proxy.ts`** at the project root, exporting a function named `proxy`. Setting `export const runtime` inside it **throws** — proxy is always Node.js runtime.
2. **All request APIs are async**: `await cookies()`, `await headers()`. `params` and `searchParams` are **Promises**.
3. **Page/layout props use auto-generated global types**, never imported:
   `export default async function Page(props: PageProps<'/books/[id]'>) { const { id } = await props.params }`.
4. **Cookies cannot be set during Server Component render** — it throws at runtime and TypeScript does *not* flag it. The Supabase server client's `setAll` must be wrapped in `try/catch`, and session refresh must happen in `proxy.ts`.
5. **`cacheComponents` is off**, so `'use cache'` / `cacheTag` are unavailable and tag-based revalidation is inert. Use **`refresh()`** (from `next/cache`, Server-Actions-only) after mutations, plus `revalidatePath(path, type)` where `type` is **required** for dynamic paths: `revalidatePath('/books/[id]', 'page')`. Never call single-arg `revalidateTag(tag)` — it is a TS error in v16.
6. **Auth checks in layouts are NOT a security boundary** — they don't re-run on client-side navigation and don't stop nested pages rendering. The real boundary is RLS + a Data Access Layer + a re-check inside every Server Action.
7. **`supabase.auth.getSession()` is untrustworthy server-side** (unverified local decode). Always `getUser()`.
8. **Server Actions dispatch one at a time per client** — never `Promise.all` them.
9. Tailwind **v4**, CSS-first (no `tailwind.config.*`). Turbopack is default; a `webpack` key in `next.config.ts` fails the build.

## A4. Architecture

Two enforcement layers, because the UI can never be trusted:

- **Postgres RLS + `security definer` RPCs** — the ground truth. All business rules live in SQL so they cannot be bypassed by any client.
- **Next.js Data Access Layer** (`lib/dal.ts`) — `cache()`-memoised `getCurrentUser()` / `requireLibrarian()`, called at the top of **every page and every Server Action**.

`proxy.ts` handles session refresh and an *optimistic* role redirect only — it is never the boundary.

## A5. Database

Migrations in `supabase/migrations/`, ordered so dependencies resolve:

```
20260809090000_extensions_and_enums.sql
20260809090100_settings.sql
20260809090200_profiles.sql
20260809090300_books_and_copies.sql
20260809090400_loans_and_fines.sql
20260809090500_helpers_and_views.sql     -- helpers after tables
20260809090600_rls_policies.sql          -- policies call is_librarian()
20260809090700_rpc_functions.sql         -- RPCs call everything
20260809090800_seed_settings_and_samples.sql
```

### Tables

- **`settings`** — single row of configurable rules.
- **`profiles`** — 1:1 with `auth.users`: `role`, `member_type`, `roll_number`, `department`, `phone`, `is_active`, plus an **`account_status`** enum (`pending` · `active` · `rejected`) with `approved_by`/`approved_at` and `rejected_by`/`rejected_at`/`rejection_reason`. Only `active` accounts may borrow.
- **`books`** — title level: title, author, isbn, publisher, year, category.
- **`book_copies`** — one row per physical copy: `accession_number` (`check (accession_number ~ '^JPR-\d{5}$')`), `status`, `condition`.
- **`loans`** — references a **copy**, not a title: `issued_at`, `due_date`, `returned_at`, `renewal_count`.
- **`fines`** — separate table (not columns on `loans`): a fine has its own lifecycle — accrues, is assessed, is paid or waived, and needs `collected_by`/`collected_at` and `waived_by`/`waive_reason`.
- **`loan_events`** — audit trail of issue/return/renew/pay/waive.

### Key design decisions

- **Privilege escalation blocked twice.** Members get *no* UPDATE policy on `profiles`, **and** a `BEFORE UPDATE` trigger rejects changes to `role`/`member_type`/`roll_number`/`is_active` from non-librarians. The trigger fires regardless of how policies are later edited. *(Satisfies SEC-3.)*
- **RLS recursion footgun.** A policy on `profiles` that reads `profiles` causes `42P17 infinite recursion`. Fixed with a `SECURITY DEFINER STABLE` helper `public.is_librarian()` with `SET search_path = ''`. Do **not** apply `force row level security` to `profiles` — it breaks this.
- **Double-issue structurally impossible:** `create unique index loans_one_active_per_copy on loans (copy_id) where returned_at is null;`. A concurrent double-scan gets `23505`, converted to a friendly message. *(Satisfies DI-1.)*
- **Fine computed live *and* frozen on return.** A stored-only value goes stale at midnight; a computed-only value silently re-prices history when the rate changes. So: an `IMMUTABLE calculate_fine()` + a `v_loans_with_fine` view for live display, with the amount written into `fines.amount` and frozen at return. *(Satisfies DI-4.)*
- **Timezone.** Supabase runs UTC; the college is IST. A naive `current_date` under-counts a day of fine. Every "today" goes through `public.today_ist()` = `(now() at time zone 'Asia/Kolkata')::date`. **Never use bare `current_date`.** `due_date` is `date`; event timestamps are `timestamptz`. *(Satisfies DI-3.)*
- **Copy status kept consistent via trigger**, not app code, so raw SQL can't desync it. *(Satisfies DI-2.)*

### RPC functions (`security definer`, each re-checks librarian)

| Function | Enforces |
|---|---|
| `issue_book(p_accession_number, p_member_id)` | Copy available; member `is_active` **and `account_status = 'active'`**; under max-books for their type. Creates loan, `due_date = today_ist() + loan_period_days`. |
| `register_member(...)` | **The only path that runs as an anonymous caller.** Refuses unless the registration toggle is on. Forces `role='member'` and `account_status='pending'` regardless of input. Rejects duplicate email or roll number. |
| `approve_member(p_profile_id, …)` | Librarian only. Sets `account_status='active'`, records `approved_by`/`approved_at`. Accepts corrected field values (e.g. member type). |
| `approve_and_issue(p_profile_id, p_accession_number, …)` | Librarian only. Approves the pending member **and** issues the copy in **one transaction** — so a failure at the issue step (copy already out, limit reached) leaves the member un-approved rather than half-processed. |
| `reject_member(p_profile_id, p_reason)` | Librarian only. Sets `account_status='rejected'`, records reason and actor. The row is retained, so the email stays claimed. |
| `return_book(p_loan_id)` | Sets `returned_at`, computes and **freezes** the final fine, marks copy available. |
| `renew_loan(p_loan_id)` | `renewal_count < max_renewals`; **rejects while any unpaid fine exists on the loan**. New `due_date = today_ist() + loan_period_days`. |
| `pay_fine(p_fine_id)` | Full payment only. Records `collected_by` + `collected_at`. |
| `waive_fine(p_fine_id, p_reason)` | Requires a non-empty reason; records `waived_by`, `waived_at`, `waive_reason`. |
| `mark_copy_lost(p_accession, p_loan_id)` | Closes the loan, freezes the fine to date, sets copy `lost`. |

Each raises a **human-readable** exception (e.g. *"Arun already has 3 books issued"*) — these strings surface verbatim in the UI.

> **Design note.** Because the confirmed rule is "pay the fine before renewing", an earlier design's fine carry-forward mechanism is unnecessary and has been dropped. `renew_loan` simply refuses while an unpaid fine exists.

> **Security note on `register_member`.** This is the **only** entry point reachable by an unauthenticated caller, so it is the one place where hostile input arrives. It must therefore hard-code `role` and `account_status` rather than accept them, check the toggle inside the function (not in the UI), and be rate-limited. Anything the applicant submits about their own privileges is discarded. The declared `member_type` is *stored as a claim* and only takes effect on approval, when a librarian has confirmed it.
>
> Supabase's own sign-up must stay **disabled** at the provider; registration goes exclusively through this function, so the toggle and the pending state can never be bypassed by calling `auth.signUp()` directly.

### Setup
Seed the settings row, sample books/copies, and promote the first user to librarian via SQL after creating them in the Supabase dashboard. **Also disable sign-ups in the dashboard** (Authentication → Providers → Email → uncheck "Allow new users to sign up") — SQL alone cannot stop `auth.signUp()`. Seed **two** librarians so a lost password isn't a lockout.

## A6. Application structure

```
proxy.ts                          # Session refresh + optimistic role redirect (NOT middleware.ts)
app/
  layout.tsx                      # Root shell; no auth, no cookies() -> stays static
  page.tsx                        # Role fan-out: /login | /dashboard | /my
  (auth)/login/                   # Login
  (auth)/register/                # Public registration — gated by the toggle
  (librarian)/
    dashboard/                    # KPIs, overdue list
    counter/                      # THE scan screen
    books/ [id]/ new/ copies/     # Catalogue CRUD + copy management
    members/ [id]/ new/ edit/     # Member CRUD
    registrations/                # Quiet list of pending/rejected — no badge
    loans/                        # All active loans; All / Due today / Overdue
    fines/                        # Collect or waive
    staff/                        # Librarian accounts
    settings/                     # Loan rules editor
  (member)/my/                    # READ-ONLY: loans, history, catalogue
lib/
  supabase/{client,server,admin,proxy-client}.ts
  dal.ts                          # THE security boundary
  data/{books,members,loans,fines,settings}.ts
  actions/{auth,circulation,books,members,staff,fines,settings}.ts
  {schemas,errors,types,database.types,utils}.ts
components/
  ui/                             # shadcn primitives
  counter/{scan-input,scan-feedback,member-slot,recent-scans}.tsx
  app-shell.tsx, search-input.tsx, empty-state.tsx, ...
```

### The three Supabase clients

- **`lib/supabase/server.ts`** — for RSC and Server Actions. `setAll` **must** be wrapped in try/catch (setting cookies during render throws; TS won't catch it). Safe to swallow because `proxy.ts` already refreshed the session.
- **`lib/supabase/admin.ts`** — service role, for `auth.admin.createUser`. Three layers keep it off the client: no `NEXT_PUBLIC_` prefix, `import 'server-only'` (build-time error on client import), and it is only called from `'use server'` modules. *(Satisfies SEC-5.)*
- **`proxy.ts`** — cookies are written onto a *specific* response object, so that exact object must be returned. When redirecting, cookies must be **copied onto the redirect response**, or the refreshed session is lost and you get a redirect loop.

Role for the optimistic proxy check lives in **`app_metadata`** (service-role-writable only), never `user_metadata` (self-writable — a member could promote themselves).

### Server Actions

One pattern throughout: `await requireLibrarian()` → zod parse → call RPC → map Postgres error to a message → `refresh()`. Errors surface through a shared `ActionState` via `useActionState(fn, idleState)`.

Postgres `raise exception` arrives as `PostgrestError` code `P0001`; those messages are author-written and safe to display verbatim. Anything else gets a generic message and a server-side log.

Actions: `signIn`, `signOut`, `issueBook`, `returnBook`, `renewLoan`, `collectFine`, `waiveFine`, `createBook`, `updateBook`, `addCopies`, `setCopyStatus`, `createMember`, `updateMember`, `setMemberActive`, `createLibrarian`, `updateSettings`.

## A7. Counter screen implementation notes

Mapping to requirements C-1 … C-11:

- **Two-slot state machine** — slot A = member, slot B = scanned accession. Mode inferred from whether slot A is filled.
- **Use `readOnly`, not `disabled`, while pending** — `disabled` blurs the field and drops the next scan.
- **A `nonce` on every action result.** Without it, scanning the same bad barcode twice produces a deeply-equal state object, React bails out of re-rendering, and the error banner doesn't re-flash — the librarian thinks nothing happened.
- **Double-fire guard** — ignore the same code within ~1200ms.
- Feedback banner ≥2rem type with `aria-live="assertive"` plus distinct success/failure beeps.

## A8. shadcn/ui on Tailwind v4

`pnpm dlx shadcn@latest init` — new-york, slate, CSS variables. Aliases resolve via `@/*` → `./*`. If the CLI tries to create `src/`, abort and pass explicit paths.

**Three required fixes in `app/globals.css`:**

1. **Delete `body { font-family: Arial, Helvetica, sans-serif; }`.** The scaffold loads and pays for the Geist fonts, maps them in `@theme inline`, then overrides them with Arial. They are currently never rendered.
2. **Switch dark mode to the class strategy** — add `@custom-variant dark (&:is(.dark *));`. The file uses `@media (prefers-color-scheme: dark)` while shadcn emits `.dark { … }`; running both gives a librarian on a dark OS a dark UI with light tokens.
3. **Merge into a single `@theme inline` block** — don't leave two with conflicting `--color-background`.

Components: `button input label form select textarea checkbox table card badge dialog alert-dialog dropdown-menu sonner skeleton tabs separator avatar tooltip popover command sheet alert pagination scroll-area switch`.

## A9. Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=       # server-only, bypasses RLS, NEVER NEXT_PUBLIC_
```

`.gitignore` line 34 is `.env*`, which swallows `.env.example` too. Add `!.env.example` **after** it (order matters).

## A10. Build order

Each phase ends in something runnable and demoable.

| Phase | Work | Testable outcome |
|---|---|---|
| **0. Foundation** | `git init` + first commit (**the repo is not initialised**). Install `@supabase/supabase-js @supabase/ssr zod server-only`. shadcn init. Fix `globals.css`. `.gitignore` negation + `.env.example`. | `pnpm dev` renders a styled shadcn button in Geist, light and dark. |
| **1. Database** | All 9 migrations. Seed settings, sample books, two librarians. Disable sign-ups. Generate `lib/database.types.ts`. | RPCs callable from the SQL editor; all rules enforced. |
| **2. Auth spine** | Four Supabase clients, `proxy.ts`, `lib/dal.ts`, login, role fan-out, empty shells. | Librarian lands on `/dashboard`; member typing `/dashboard` is bounced to `/my`; refresh doesn't log you out. |
| **3. Catalogue read** | `/books` search + pagination, `/books/[id]`, loading/empty/error states. | Search by title/author/ISBN over real rows. |
| **4. Catalogue write** | `createBook`, `updateBook`, `addCopies`, `setCopyStatus`. Establishes the zod + `ActionState` pattern. | Add a book with 5 copies; see `JPR-000xx` accession numbers. |
| **5. Members** | `createMember` (first service-role use), list/detail/edit. | Create a student, log in as them, land on an empty `/my`. |
| **5a. Registration** | `register_member` RPC, `/register` page, `/registrations` list, approve/reject actions, the Settings toggle. | With the toggle on, register as a stranger → pending, cannot borrow. With it off, the API call is refused. |
| **6. The counter** | `issueBook`, `returnBook`, `renewLoan`, `approveAndIssue`, `ScanInput`, feedback, undo. `/loans`. | Issue and return with a real USB scanner; breach the 3-book limit and see the RPC message verbatim; find a pending member and approve-and-issue in one step. |
| **7. Fines & settings** | `collectFine`, `waiveFine`, `/fines`, `/settings`. | Back-date a due date, watch ₹1/day accrue, collect it; confirm renewal is blocked until paid. |
| **8. Member portal** | `/my`, `/my/history`, `/my/catalogue`. | As a member, no mutating control is reachable anywhere. |
| **9. Hardening** | `/staff`, error boundaries, RLS penetration pass. | With a member's session, direct queries and RPCs fail **at the database**. |

## A11. Verification

**Rule enforcement (run in the SQL editor, bypassing the UI entirely):**
- 4th book to a student → refused with the limit message
- Already-issued copy → friendly duplicate message, not a raw `23505`
- 3rd renewal with `max_renewals=2` → refused
- Back-date `due_date` 5 days → live view shows ₹5; return → frozen at ₹5
- Renew overdue with unpaid fine → refused; pay, then renew succeeds
- Change `fine_per_day` to 2 → historical frozen fines unchanged
- Waive without a reason → refused

**Security:**
- As a member in the browser console: `supabase.from('loans').select('*')` → only own rows
- As a member: `supabase.rpc('issue_book', …)` → refused
- As a member: `update profiles set role='librarian' where id = auth.uid()` → refused by **both** the missing policy and the trigger
- `grep -r "service_role\|SERVICE_ROLE" .next/static/` after a build → **zero matches**
- `auth.signUp()` from the console → rejected

**Timezone:** at ~01:00 IST, confirm `today_ist()` reports the correct Indian date and fine counts don't slip a day.

**End-to-end:** with a real USB scanner — create a member, issue 2 books, scan-return one, let one go overdue, collect the fine, renew it, and confirm the member's `/my` page shows correct due dates and ₹0 owed afterwards.
