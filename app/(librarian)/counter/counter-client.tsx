"use client";

import { CheckIcon, SearchIcon, XIcon } from "lucide-react";
import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";

import { ScanFeedback } from "@/components/counter/scan-feedback";
import { ScanInput } from "@/components/counter/scan-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  approveAndIssue,
  issueBook,
  renewLoan,
  returnBook,
  type IssueResult,
} from "@/lib/actions/circulation";
import { searchBooks, type BookHit } from "@/lib/actions/books";
import { searchMembers, type MemberHit } from "@/lib/actions/members";
import { idleState, type ActionState } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Completed operations only — see the effect that fills this. */
type Recent = {
  id: number;
  what: string;
};

type Mode = "issue" | "return" | "renew";

/**
 * The three operations are NOT peers, and the layout says so.
 *
 * Issue needs a member and then a book — two steps, in order. Return and
 * Renew need only the book in hand. Rendering all three identically was the
 * confusion: nothing on screen said which one you were in or what came next.
 *
 * Structure carries that difference, not colour. The status tokens
 * (available / issued / overdue / pending) stay reserved for what a book or
 * an account IS; using them for what a button DOES would make a badge and a
 * mode picker look like the same kind of information.
 */
const MODES: {
  value: Mode;
  label: string;
  /** What the librarian does, in their words. */
  caption: string;
  /** Issue is the only two-step operation. */
  needsMember: boolean;
}[] = [
  {
    value: "issue",
    label: "Issue",
    caption: "Give a book to a member",
    needsMember: true,
  },
  {
    value: "return",
    label: "Return",
    caption: "Take a book back",
    needsMember: false,
  },
  {
    value: "renew",
    label: "Renew",
    caption: "Extend a due date",
    needsMember: false,
  },
];

/**
 * The counter.
 *
 * Two slots — a member and a scanned copy — and the MODE IS INFERRED from
 * whether a member is loaded:
 *
 *   member loaded  -> the next scan ISSUES to them
 *   no member      -> the next scan RETURNS that copy
 *
 * A copy uniquely identifies its open loan, so a return needs nothing else.
 * That is what makes the common path zero clicks.
 */
export function CounterClient() {
  const [member, setMember] = useState<MemberHit | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const recentId = useRef(0);
  /** Bumped after every settled action so the loans list refetches. */
  const [loansKey, setLoansKey] = useState(0);

  /**
   * null = follow the member slot (issue when one is loaded, return when
   * not). Picking a mode explicitly pins it until the librarian picks
   * another or clears the member.
   *
   * Inference alone was ambiguous: the screen said "Return a book" with no
   * indication of why, or how to do anything else.
   */
  const [pinnedMode, setPinnedMode] = useState<Mode | null>(null);

  // Issue is reachable WITHOUT a member: step 1 is where the member is
  // chosen, so forcing a fallback here would make the button look broken —
  // you could never get to the search that unlocks it.
  const mode: Mode = pinnedMode ?? (member ? "issue" : "return");

  const [issueState, issueAction, issuePending] = useActionState(issueBook, idleState);
  const [returnState, returnAction, returnPending] = useActionState(returnBook, idleState);
  const [approveState, approveAction, approvePending] = useActionState(
    approveAndIssue,
    idleState,
  );
  const [renewState, renewAction, renewPending] = useActionState(renewLoan, idleState);

  const pending =
    issuePending || returnPending || approvePending || renewPending;

  // Whichever action settled most recently drives the banner.
  const latest = [issueState, returnState, approveState, renewState].reduce<
    ActionState<unknown>
  >((newest, s) => ((s.nonce ?? 0) > (newest.nonce ?? 0) ? s : newest), idleState);

  // Log every settled action, newest first.
  const seen = useRef<number>(0);
  useEffect(() => {
    const nonce = latest.nonce ?? 0;
    if (!nonce || nonce === seen.current || !latest.message) return;
    seen.current = nonce;

    // Successes only. Recent is a record of what the library actually did —
    // a mistyped barcode is a typo, not history, and logging it put the same
    // red message on screen twice: once in the banner, once here.
    if (latest.ok) {
      setRecent((prev) =>
        [{ id: ++recentId.current, what: latest.message! }, ...prev].slice(0, 10),
      );
    }

    if (latest.ok && member) {
      const data = latest.data as IssueResult | undefined;

      if (data?.loansOut !== undefined && data.loansOut >= data.maxLoans) {
        // Clear the member but STAY in issue mode: the librarian is working
        // an issue queue, so the next person is the next step, not a mode
        // change. Step 1 reopens with the search focused.
        setMember(null);
      } else if (data?.loansOut !== undefined) {
        // The member object is a snapshot taken at search time. Without this
        // the header still read "0/3 books" after a successful issue, which
        // is the number the librarian checks against the borrowing limit.
        setMember((current) =>
          current ? { ...current, booksOut: data.loansOut } : current,
        );
      }

      // Any settled circulation action changes what this member holds, so
      // the books-on-loan list has to refetch. It previously keyed only on
      // renewPending and so never noticed an issue.
      setLoansKey((k) => k + 1);
    }
  }, [latest, member]);

  function handleScan(accession: string) {
    const fd = new FormData();
    fd.set("accessionNumber", accession);

    // Dispatched from a scan, not from a form action prop, so the transition
    // has to be explicit. Without it React warns and — worse here — the
    // *Pending flags never flip, so the field would not show it is busy and
    // would not clear and refocus after the action settles.
    startTransition(() => {
      if (mode === "renew") {
        // renewLoan resolves the open loan from the accession number, so a
        // renew needs no member loaded.
        renewAction(fd);
        return;
      }

      if (mode === "return") {
        returnAction(fd);
        return;
      }

      // Issue. Guarded by the UI (the mode is disabled without a member) and
      // by issue_book(), which refuses a missing member.
      if (!member) return;

      fd.set("memberId", member.id);
      if (member.accountStatus === "pending") {
        // Approve and issue in one transaction — if the issue fails, the
        // approval rolls back too.
        fd.set("memberType", member.memberType ?? "student");
        approveAction(fd);
      } else {
        issueAction(fd);
      }
    });
  }

  /**
   * Picking a member happens inside step 1 of the issue flow, so the mode is
   * left alone — unpinning here would eject the librarian from the very flow
   * they are working through. Choosing someone from Return or Renew still
   * lands on Issue, because the inferred default follows the member slot.
   */
  function selectMember(next: MemberHit | null) {
    setMember(next);
    if (next && !pinnedMode) setPinnedMode("issue");
  }

  // Esc is "start over": drop the member AND any pinned mode, back to the
  // resting state of waiting for a book to be returned.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMember(null);
        setPinnedMode(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    // The right column only exists once there is something to put in it —
    // reserving 20rem for an empty log left a dead band down the page.
    <div
      className={cn(
        "grid items-start gap-6",
        recent.length > 0 && "xl:grid-cols-[minmax(0,1fr)_20rem]",
      )}
    >
      <div className="flex min-w-0 flex-col gap-4">
        <ModeSelector mode={mode} onChange={setPinnedMode} />

        <Card>
          <CardContent className="flex flex-col gap-5">
            {mode === "issue" ? (
              <IssueSteps
                member={member}
                pending={pending}
                nonce={latest.nonce}
                onScan={handleScan}
                onSelectMember={selectMember}
                onClearMember={() => selectMember(null)}
              />
            ) : (
              <ScanTarget
                title={mode === "return" ? "Take a book back" : "Extend a due date"}
                hint={
                  mode === "return"
                    ? "Scan the book. Any fine is worked out automatically."
                    : "Scan the book. The new due date runs 15 days from today."
                }
                pending={pending}
                nonce={latest.nonce}
                onScan={handleScan}
                placeholder={mode === "return" ? "Scan to return…" : "Scan to renew…"}
              />
            )}

            <ScanFeedback state={latest} />

            {/* Occasional lookup — "which copy do I fetch?" — so it stays shut
                until asked for rather than sitting open beside the scan field. */}
            <BookSearch />
          </CardContent>
        </Card>

        {/* Only in issue mode: in return/renew the book in hand is the
            subject, not a member. */}
        {member && mode === "issue" ? (
          <MemberPanel
            member={member}
            onClear={() => selectMember(null)}
            renewAction={renewAction}
            renewPending={renewPending}
            loansKey={loansKey}
          />
        ) : null}
      </div>

      <RecentList items={recent} />
    </div>
  );
}

/**
 * What the next scan will do.
 *
 * The mode still follows the member slot by default, so the common path is
 * unchanged — load a member and scan, or scan with no member to return. This
 * only makes that state visible and lets the librarian override it, which
 * inference alone could not express.
 */
function ModeSelector({
  mode,
  onChange,
}: {
  mode: Mode;
  onChange: (mode: Mode | null) => void;
}) {
  return (
    <ToggleGroup
      value={[mode]}
      onValueChange={(value) => {
        // Base UI hands back an array; single-select yields at most one. An
        // empty array means the active item was clicked again — keep the
        // mode rather than leaving the counter with none.
        const next = value[0] as Mode | undefined;
        if (next) onChange(next);
      }}
      spacing={2}
      aria-label="What the next scan does"
      className="grid w-full grid-cols-3"
    >
      {MODES.map((m) => {
        const isActive = m.value === mode;

        return (
          <ToggleGroupItem
            key={m.value}
            value={m.value}
            className={cn(
              "h-auto flex-col items-start gap-0.5 rounded-lg border px-3 py-2.5 text-left",
              isActive
                ? "border-primary bg-primary/5 text-primary"
                : "border-border bg-card",
            )}
          >
            <span className="text-sm font-semibold">{m.label}</span>
            <span className="text-xs font-normal opacity-80">{m.caption}</span>
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}

/**
 * Return and Renew: one book, one scan, nothing else to know.
 *
 * Deliberately NOT numbered — a single step numbered "1" implies a step 2
 * that does not exist.
 */
function ScanTarget({
  title,
  hint,
  pending,
  nonce,
  onScan,
  placeholder,
}: {
  title: string;
  hint: string;
  pending: boolean;
  nonce?: number;
  onScan: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-muted-foreground text-sm">{hint}</p>
      </div>
      <ScanInput
        pending={pending}
        nonce={nonce}
        onScan={onScan}
        placeholder={placeholder}
      />
    </div>
  );
}

/**
 * Issue is the only two-step operation, so it is the only one that is
 * numbered. The numbering is real information: the member must be loaded
 * before a scan can mean anything.
 */
function IssueSteps({
  member,
  pending,
  nonce,
  onScan,
  onSelectMember,
  onClearMember,
}: {
  member: MemberHit | null;
  pending: boolean;
  nonce?: number;
  onScan: (value: string) => void;
  onSelectMember: (member: MemberHit) => void;
  onClearMember: () => void;
}) {
  const atLimit = member ? member.booksOut >= member.maxBooks : false;

  return (
    <div className="flex flex-col gap-4">
      <Step n={1} label="Member" done={Boolean(member)}>
        {member ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium">{member.fullName}</span>
            <span className="text-muted-foreground text-sm">
              {member.rollNumber ?? "—"} ·{" "}
              {member.memberType === "staff" ? "Faculty" : "Student"} ·{" "}
              {member.booksOut}/{member.maxBooks} books
            </span>
            {member.owed > 0 ? (
              <Badge className="bg-overdue-subtle text-overdue">
                ₹{member.owed.toFixed(2)} due
              </Badge>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={onClearMember}
            >
              <XIcon />
              Change
            </Button>
          </div>
        ) : (
          // The search lives in the step that needs it, not in a separate
          // panel competing with it.
          <MemberSearch onSelect={onSelectMember} />
        )}
      </Step>

      <Step n={2} label="Book" done={false} muted={!member}>
        {atLimit ? (
          <p className="text-overdue text-sm font-medium">
            {member!.fullName} is at the {member!.maxBooks}-book limit. Take a
            book back before issuing another.
          </p>
        ) : (
          <ScanInput
            pending={pending}
            nonce={nonce}
            onScan={onScan}
            disabled={!member}
            placeholder={member ? "Scan to issue…" : "Load a member first…"}
          />
        )}
      </Step>
    </div>
  );
}

/** One numbered step in the issue sequence. */
function Step({
  n,
  label,
  done,
  muted,
  children,
}: {
  n: number;
  label: string;
  done: boolean;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex gap-3", muted && "opacity-55")}>
      <span
        className={cn(
          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
          done
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground",
        )}
        aria-hidden
      >
        {done ? <CheckIcon className="size-3.5" /> : n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {label}
        </span>
        {children}
      </div>
    </div>
  );
}

/**
 * "Do we have this book, and which copy do I fetch?"
 *
 * The counter otherwise assumes the book is already in hand — every mode
 * starts from a barcode. This answers the question that comes first when a
 * student asks for a title by name, without leaving the screen.
 *
 * It is deliberately read-only: the librarian still has to fetch the physical
 * copy and scan it, so there is nothing here to click by mistake.
 */
function BookSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<BookHit[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, startSearch] = useTransition();
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onQueryChange(value: string) {
    setQuery(value);

    if (debounce.current) clearTimeout(debounce.current);

    const q = value.trim();
    if (q.length < 2) {
      setHits([]);
      setSearched(false);
      return;
    }

    debounce.current = setTimeout(() => {
      startSearch(async () => {
        setHits(await searchBooks(q));
        setSearched(true);
      });
    }, 220);
  }

  useEffect(() => () => {
    if (debounce.current) clearTimeout(debounce.current);
  }, []);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:text-foreground flex items-center gap-2 self-start text-sm transition-colors"
      >
        <SearchIcon className="size-4" />
        Which copy do I fetch?
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      <>
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-medium">Find a book on the shelf</h4>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setOpen(false);
              onQueryChange("");
            }}
          >
            <XIcon />
            Close
          </Button>
        </div>

        <div className="relative">
          <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Title, author or ISBN"
            className="pl-9"
            autoFocus
            aria-label="Search books"
          />
          {searching ? (
            <Spinner className="text-muted-foreground absolute top-1/2 right-3 size-4 -translate-y-1/2" />
          ) : null}
        </div>

        {searched && !hits.length && !searching ? (
          <p className="text-muted-foreground text-sm">
            Nothing matches “{query.trim()}”.
          </p>
        ) : null}

        {hits.map((book) => (
          <div key={book.id} className="flex flex-col gap-1.5 rounded-lg border p-3">
            <div>
              <div className="text-sm font-medium">{book.title}</div>
              <div className="text-muted-foreground text-xs">{book.author}</div>
            </div>

            {book.availableCopies > 0 ? (
              <>
                <Badge className="bg-available-subtle text-available w-fit">
                  {book.availableCopies} of {book.totalCopies} on the shelf
                </Badge>
                <ul className="flex flex-col gap-0.5">
                  {book.available.map((copy) => (
                    <li
                      key={copy.accessionNumber}
                      className="flex items-baseline justify-between gap-2 text-xs"
                    >
                      <span className="font-mono">{copy.accessionNumber}</span>
                      <span className="text-muted-foreground">
                        {copy.shelfLocation ?? "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <Badge className="bg-issued-subtle text-issued w-fit">
                  All {book.totalCopies} out
                </Badge>
                {book.nextDue ? (
                  <p className="text-muted-foreground text-xs">
                    Next due {book.nextDue}.
                  </p>
                ) : null}
              </>
            )}
          </div>
        ))}
      </>
    </div>
  );
}

/**
 * Member autocomplete for step 1.
 *
 * A dropdown anchored to the field rather than a list pushed inline below it:
 * with a few hundred members, "ar" matches enough people to shove the rest of
 * the wizard off the screen. The results overlay instead, and the list itself
 * scrolls.
 *
 * Filtering is done by Postgres, not the browser — `filter={null}` stops Base
 * UI re-filtering server results, which would hide rows matched on a field
 * the label does not show (a roll number, say).
 */
function MemberSearch({ onSelect }: { onSelect: (member: MemberHit) => void }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<MemberHit[]>([]);
  const [searching, startSearch] = useTransition();
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced in the change handler rather than an effect: the search is a
  // response to typing, not a synchronisation with external state.
  function onQueryChange(value: string) {
    setQuery(value);

    if (debounce.current) clearTimeout(debounce.current);

    const q = value.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }

    debounce.current = setTimeout(() => {
      startSearch(async () => {
        setHits(await searchMembers(q));
      });
    }, 220);
  }

  useEffect(() => () => {
    if (debounce.current) clearTimeout(debounce.current);
  }, []);

  const typedEnough = query.trim().length >= 2;

  return (
    <Combobox
      items={hits}
      filter={null}
      value={null}
      inputValue={query}
      onInputValueChange={onQueryChange}
      onValueChange={(value) => {
        const hit = value as MemberHit | null;
        if (!hit) return;
        onSelect(hit);
        onQueryChange("");
      }}
      itemToStringLabel={(hit: MemberHit) => hit.fullName}
    >
      <ComboboxInput
        placeholder="Search name or roll number"
        showTrigger={false}
        autoFocus
        aria-label="Search members"
      />

      <ComboboxContent>
        <ComboboxEmpty>
          {searching
            ? "Searching…"
            : typedEnough
              ? `No member matches “${query.trim()}”.`
              : "Type at least two characters."}
        </ComboboxEmpty>

        <ComboboxList>
          {(hit: MemberHit) => (
            <ComboboxItem key={hit.id} value={hit} className="items-start">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-2">
                  <span className="truncate font-medium">{hit.fullName}</span>
                  {hit.accountStatus === "pending" ? (
                    <Badge className="bg-pending-subtle text-pending">Pending</Badge>
                  ) : null}
                  {!hit.isActive ? (
                    <Badge className="bg-overdue-subtle text-overdue">Inactive</Badge>
                  ) : null}
                </span>
                <span className="text-muted-foreground truncate text-xs">
                  {hit.rollNumber ?? "—"}
                  {hit.department ? ` · ${hit.department}` : ""}
                  {" · "}
                  {hit.booksOut}/{hit.maxBooks} books
                  {hit.owed > 0 ? ` · ₹${hit.owed.toFixed(2)} due` : ""}
                </span>
              </div>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

function MemberPanel({
  member,
  onClear,
  renewAction,
  renewPending,
  loansKey,
}: {
  member: MemberHit;
  onClear: () => void;
  renewAction: (formData: FormData) => void;
  renewPending: boolean;
  loansKey: number;
}) {
  const pending = member.accountStatus === "pending";

  // The member's name and counts live in step 1 above; this card carries only
  // what step 1 cannot — the approval warning, and the books they hold.
  return (
    <Card className={pending ? "border-pending" : undefined}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {pending ? "Before you issue" : `Books with ${member.fullName}`}
          {pending ? (
            <Badge className="bg-pending-subtle text-pending">Awaiting approval</Badge>
          ) : null}
        </CardTitle>
        {!pending ? (
          <CardDescription>Renew any of these without a new scan.</CardDescription>
        ) : null}
      </CardHeader>

      {pending ? (
        <CardContent className="flex flex-col gap-3">
          <div className="bg-pending-subtle text-pending rounded-lg p-4 text-sm">
            <p className="font-semibold">Check the college ID card before issuing.</p>
            <p className="mt-1">
              They registered as{" "}
              <strong>
                {member.declaredMemberType === "staff" ? "faculty" : "a student"}
              </strong>
              , which allows {member.maxBooks} books. Scanning a book below will
              approve this account and issue in one step.
            </p>
          </div>
          <Button variant="outline" onClick={onClear}>
            Cancel
          </Button>
        </CardContent>
      ) : (
        <CardContent>
          <MemberLoansList
            memberId={member.id}
            renewAction={renewAction}
            renewPending={renewPending}
            loansKey={loansKey}
          />
        </CardContent>
      )}
    </Card>
  );
}

function MemberLoansList({
  memberId,
  renewAction,
  renewPending,
  loansKey,
}: {
  memberId: string;
  renewAction: (formData: FormData) => void;
  renewPending: boolean;
  loansKey: number;
}) {
  type Loan = Awaited<ReturnType<typeof import("@/lib/actions/members").memberLoans>>[number];
  const [loans, setLoans] = useState<Loan[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { memberLoans } = await import("@/lib/actions/members");
      const rows = await memberLoans(memberId);
      if (!cancelled) setLoans(rows);
    })();
    return () => {
      cancelled = true;
    };
    // loansKey is bumped by every settled circulation action, so an issue
    // shows up here immediately rather than only after a renew.
  }, [memberId, loansKey]);

  if (loans === null) {
    return <Spinner className="text-muted-foreground size-5" />;
  }

  if (!loans.length) {
    return (
      <Empty className="py-6">
        <EmptyTitle>No books issued</EmptyTitle>
        <EmptyDescription>Scan a book above to issue it.</EmptyDescription>
      </Empty>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {loans.map((loan) => (
        <li
          key={loan.id}
          className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{loan.book_title}</p>
            <p className="text-muted-foreground font-mono text-xs">
              {loan.accession_number} · due {loan.due_date}
            </p>
          </div>

          {loan.is_overdue ? (
            <Badge className="bg-overdue-subtle text-overdue">
              {loan.days_overdue}d late · ₹
              {Number(loan.fine_outstanding ?? 0).toFixed(2)}
            </Badge>
          ) : null}

          <Button
            variant="outline"
            size="sm"
            disabled={renewPending}
            onClick={() => {
              const fd = new FormData();
              fd.set("loanId", loan.id!);
              // Explicit transition: dispatched from onClick, not a form
              // action prop, so renewPending would otherwise never flip and
              // this button would stay clickable during the request.
              startTransition(() => renewAction(fd));
            }}
          >
            Renew
          </Button>
        </li>
      ))}
    </ul>
  );
}

function RecentList({ items }: { items: Recent[] }) {
  // Nothing yet is nothing to show — an empty card would take a column of
  // space to say so.
  if (!items.length) return null;

  return (
    <Card className="xl:sticky xl:top-4">
      <CardHeader>
        <CardTitle>Recent</CardTitle>
        <CardDescription>This session, newest first.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2 text-sm">
          {items.map((item) => (
            <li key={item.id} className="flex gap-2">
              <span className="bg-available mt-1.5 size-2 shrink-0 rounded-full" />
              <span className="text-muted-foreground">{item.what}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
