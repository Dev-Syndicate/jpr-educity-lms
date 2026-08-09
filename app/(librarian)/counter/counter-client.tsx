"use client";

import { CheckIcon, SearchIcon, UserRoundIcon, XIcon } from "lucide-react";
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

type Recent = {
  id: number;
  what: string;
  ok: boolean;
};

type Mode = "issue" | "return" | "renew";

/**
 * The three operations are NOT peers, and the layout says so.
 *
 * Issue needs a member and then a book — two steps, in order. Return and
 * Renew need only the book in hand. Rendering all three identically was the
 * confusion: nothing on screen said which one you were in or what came next.
 *
 * Each mode owns a domain colour already defined in globals.css, so the
 * colour carries meaning rather than decoration:
 *   issue  -> issued  (blue, a copy going out)
 *   return -> available (teal, a copy coming back to the shelf)
 *   renew  -> pending (orange, a loan being extended)
 */
const MODES: {
  value: Mode;
  label: string;
  /** What the librarian does, in their words. */
  caption: string;
  /** Issue is the only two-step operation. */
  needsMember: boolean;
  tint: { chip: string; ring: string; text: string; bar: string };
}[] = [
  {
    value: "issue",
    label: "Issue",
    caption: "Give a book to a member",
    needsMember: true,
    tint: {
      chip: "bg-issued-subtle text-issued",
      ring: "border-issued",
      text: "text-issued",
      bar: "bg-issued",
    },
  },
  {
    value: "return",
    label: "Return",
    caption: "Take a book back",
    needsMember: false,
    tint: {
      chip: "bg-available-subtle text-available",
      ring: "border-available",
      text: "text-available",
      bar: "bg-available",
    },
  },
  {
    value: "renew",
    label: "Renew",
    caption: "Extend a due date",
    needsMember: false,
    tint: {
      chip: "bg-pending-subtle text-pending",
      ring: "border-pending",
      text: "text-pending",
      bar: "bg-pending",
    },
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

  /**
   * null = follow the member slot (issue when one is loaded, return when
   * not). Picking a mode explicitly pins it until the librarian picks
   * another or clears the member.
   *
   * Inference alone was ambiguous: the screen said "Return a book" with no
   * indication of why, or how to do anything else.
   */
  const [pinnedMode, setPinnedMode] = useState<Mode | null>(null);

  // A pin of "issue" is meaningless without someone to issue to, so it falls
  // back rather than leaving the counter in a mode it cannot act on.
  const effectivePin = pinnedMode === "issue" && !member ? null : pinnedMode;
  const mode: Mode = effectivePin ?? (member ? "issue" : "return");
  const active = MODES.find((m) => m.value === mode)!;

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

    setRecent((prev) =>
      [{ id: ++recentId.current, what: latest.message!, ok: latest.ok }, ...prev].slice(0, 10),
    );

    // A successful issue frees the member slot only if they have hit their
    // limit; otherwise keep them loaded so the next book can be scanned.
    if (latest.ok && member) {
      const data = latest.data as IssueResult | undefined;
      if (data?.loansOut !== undefined && data.loansOut >= data.maxLoans) {
        setMember(null);
        // Unpin only if the pin was Issue, which is now impossible without a
        // member. An explicit Renew or Return stays as the librarian set it.
        setPinnedMode((pin) => (pin === "issue" ? null : pin));
      }
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
   * Loading or clearing a member drops back to the inferred mode, so picking
   * someone always lands on Issue rather than leaving the counter pinned to
   * Return from a previous book.
   */
  function selectMember(next: MemberHit | null) {
    setMember(next);
    setPinnedMode(null);
  }

  // Esc clears the member slot.
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
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex flex-col gap-4">
        <ModeSelector
          mode={mode}
          memberLoaded={Boolean(member)}
          onChange={setPinnedMode}
        />

        <Card className="overflow-hidden pt-0">
          {/* The active mode's colour runs across the top of the card, so the
              operation is identifiable before reading a word. */}
          <div className={cn("h-1 w-full", active.tint.bar)} />

          <CardContent className="flex flex-col gap-5 pt-5">
            {mode === "issue" ? (
              <IssueSteps
                member={member}
                pending={pending}
                nonce={latest.nonce}
                onScan={handleScan}
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
                tint={active.tint}
                pending={pending}
                nonce={latest.nonce}
                onScan={handleScan}
                placeholder={mode === "return" ? "Scan to return…" : "Scan to renew…"}
              />
            )}

            <ScanFeedback state={latest} />
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
          />
        ) : null}
      </div>

      <div className="flex flex-col gap-4">
        <MemberSearch selected={member} onSelect={selectMember} />
        <BookSearch />
        <RecentList items={recent} />
      </div>
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
  memberLoaded,
  onChange,
}: {
  mode: Mode;
  memberLoaded: boolean;
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
        const locked = m.needsMember && !memberLoaded;

        return (
          <ToggleGroupItem
            key={m.value}
            value={m.value}
            disabled={locked}
            className={cn(
              "h-auto flex-col items-start gap-0.5 rounded-lg border px-4 py-3 text-left",
              isActive
                ? cn(m.tint.ring, m.tint.chip, "border-2")
                : "border-border bg-card",
            )}
          >
            <span
              className={cn(
                "text-base font-semibold",
                isActive ? m.tint.text : undefined,
              )}
            >
              {m.label}
            </span>
            <span className="text-xs font-normal opacity-80">
              {locked ? "Load a member first" : m.caption}
            </span>
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
  tint,
  pending,
  nonce,
  onScan,
  placeholder,
}: {
  title: string;
  hint: string;
  tint: { text: string };
  pending: boolean;
  nonce?: number;
  onScan: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className={cn("text-lg font-semibold", tint.text)}>{title}</h3>
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
  onClearMember,
}: {
  member: MemberHit | null;
  pending: boolean;
  nonce?: number;
  onScan: (value: string) => void;
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
          <p className="text-muted-foreground text-sm">
            Search by name or roll number on the right.
          </p>
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
          done ? "bg-issued text-issued-foreground" : "bg-muted text-muted-foreground",
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Find a book</CardTitle>
        <CardDescription>
          Search the shelf by title, author or ISBN.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="relative">
          <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Title, author or ISBN"
            className="pl-9"
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
      </CardContent>
    </Card>
  );
}

function MemberSearch({
  selected,
  onSelect,
}: {
  selected: MemberHit | null;
  onSelect: (member: MemberHit | null) => void;
}) {
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Member</CardTitle>
        <CardDescription>Search by name or roll number.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="relative">
          <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Name or roll number"
            className="pl-9"
            aria-label="Search members"
          />
          {searching ? (
            <Spinner className="text-muted-foreground absolute top-1/2 right-3 size-4 -translate-y-1/2" />
          ) : null}
        </div>

        {selected ? (
          <div className="flex items-start gap-2 rounded-lg border p-3">
            <UserRoundIcon className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{selected.fullName}</p>
              <p className="text-muted-foreground truncate text-xs">
                {selected.rollNumber ?? "—"} · {selected.booksOut}/{selected.maxBooks} books
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Clear member"
              onClick={() => onSelect(null)}
            >
              <XIcon />
            </Button>
          </div>
        ) : null}

        {hits.length ? (
          <ul className="flex flex-col gap-1">
            {hits.map((hit) => (
              <li key={hit.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(hit);
                    onQueryChange("");
                    setHits([]);
                  }}
                  className="hover:bg-accent flex w-full flex-col items-start gap-1 rounded-lg p-2.5 text-left transition-colors"
                >
                  <span className="flex w-full items-center gap-2">
                    <span className="flex-1 truncate font-medium">{hit.fullName}</span>
                    {hit.accountStatus === "pending" ? (
                      <Badge className="bg-pending-subtle text-pending">Pending</Badge>
                    ) : null}
                    {!hit.isActive ? (
                      <Badge className="bg-overdue-subtle text-overdue">Inactive</Badge>
                    ) : null}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {hit.rollNumber ?? "—"}
                    {hit.department ? ` · ${hit.department}` : ""}
                    {" · "}
                    {hit.booksOut}/{hit.maxBooks} books
                    {hit.owed > 0 ? ` · ₹${hit.owed.toFixed(2)} due` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {query.trim().length >= 2 && !searching && !hits.length ? (
          <p className="text-muted-foreground p-2 text-sm">
            No member matches “{query.trim()}”.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function MemberPanel({
  member,
  onClear,
  renewAction,
  renewPending,
}: {
  member: MemberHit;
  onClear: () => void;
  renewAction: (formData: FormData) => void;
  renewPending: boolean;
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
}: {
  memberId: string;
  renewAction: (formData: FormData) => void;
  renewPending: boolean;
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
  }, [memberId, renewPending]);

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
  if (!items.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent</CardTitle>
        <CardDescription>This session, newest first.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2 text-sm">
          {items.map((item) => (
            <li key={item.id} className="flex gap-2">
              <span
                className={
                  item.ok
                    ? "bg-available mt-1.5 size-2 shrink-0 rounded-full"
                    : "bg-overdue mt-1.5 size-2 shrink-0 rounded-full"
                }
              />
              <span className="text-muted-foreground">{item.what}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
