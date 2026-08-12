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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  approveAndIssue,
  issueBook,
  lookupCopy,
  renewLoan,
  returnBook,
  type CopyLookup,
  type IssueResult,
} from "@/lib/actions/circulation";
import { searchBooks, type BookHit } from "@/lib/actions/books";
import { searchMembers, type MemberHit } from "@/lib/actions/members";
import {
  MATERIAL_CATEGORY_LABELS,
  idleState,
  type ActionState,
} from "@/lib/types";
import { cn, initials } from "@/lib/utils";

type Mode = "issue" | "return" | "renew";

/**
 * The copy awaiting confirmation, from the moment it is scanned.
 *
 * Opened with `lookup: null` before the lookup resolves, so the dialog appears
 * on the scan rather than a beat later — the librarian sees the scan register
 * immediately, and the details fill in.
 */
type Confirm = {
  accession: string;
  lookup: CopyLookup | null;
  error: string | null;
};

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
  /** Non-null while the issue confirmation dialog is open. */
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  /** Where focus returns when the confirmation dialog closes. */
  const scanFieldRef = useRef<HTMLInputElement>(null);
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

  // React to every settled action exactly once.
  //
  // The updates are deferred into a microtask rather than run in the effect
  // body. They are a *response to an action settling*, not a render-time
  // synchronisation, and writing state synchronously here schedules a
  // cascading render off the same commit — which is what
  // react-hooks/set-state-in-effect flags. Awaiting first moves them out of
  // that commit without changing the observable behaviour.
  const seen = useRef<number>(0);
  useEffect(() => {
    const nonce = latest.nonce ?? 0;
    if (!nonce || nonce === seen.current || !latest.message) return;
    seen.current = nonce;

    if (!latest.ok || !member) return;

    let cancelled = false;

    void Promise.resolve().then(() => {
      if (cancelled) return;

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
    });

    return () => {
      cancelled = true;
    };
  }, [latest, member]);

  function handleScan(accession: string) {
    // Issue confirms first. The scan resolves the copy read-only and opens the
    // dialog; nothing is issued until the librarian clicks Issue there. Return
    // and renew still act on the scan alone — the book is in hand and there is
    // no wrong-member to catch.
    if (mode === "issue") {
      if (!member) return;
      setConfirm({ accession, lookup: null, error: null });

      startTransition(async () => {
        const state = await lookupCopy(accession);
        setConfirm((current) =>
          // A second scan while this one was in flight wins — dropping the
          // stale result rather than overwriting the newer lookup.
          current?.accession !== accession
            ? current
            : state.ok
              ? { accession, lookup: state.data!, error: null }
              : { accession, lookup: null, error: state.message ?? "Could not look up that copy." },
        );
      });
      return;
    }

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

      returnAction(fd);
    });
  }

  /** Issue the copy sitting in the confirmation dialog. */
  function confirmIssue() {
    if (!confirm || !member) return;

    const fd = new FormData();
    fd.set("accessionNumber", confirm.accession);
    fd.set("memberId", member.id);

    startTransition(() => {
      if (member.accountStatus === "pending") {
        // Approve and issue in one transaction — if the issue fails, the
        // approval rolls back too.
        fd.set("memberType", member.memberType ?? "student");
        approveAction(fd);
      } else {
        issueAction(fd);
      }
      setConfirm(null);
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
  //
  // With the confirmation open Esc means "not this book" and nothing more —
  // the dialog closes itself, and clearing the member here too would eject the
  // librarian from a member they are still issuing to.
  const confirmOpen = confirm !== null;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !confirmOpen) {
        setMember(null);
        setPinnedMode(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmOpen]);

  // The right column holds the loaded member, so it only exists in issue mode
  // with someone loaded — in return/renew the book in hand is the subject and
  // reserving 22rem for nothing would leave a dead band down the page.
  const showMemberColumn = Boolean(member) && mode === "issue";

  return (
    <div
      className={cn(
        "grid items-start gap-6",
        showMemberColumn && "xl:grid-cols-[minmax(0,1fr)_22rem]",
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
                scanFieldRef={scanFieldRef}
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
      </div>

      {/* The person in front of you, kept beside the scan field rather than
          below it: the librarian checks the face and the ID card WHILE
          scanning, so pushing it under the fold would mean scrolling away
          from the field they are about to use. */}
      {showMemberColumn ? (
        <div className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-4">
          <MemberDetailsCard member={member!} onClear={() => selectMember(null)} />
          <MemberPanel
            member={member!}
            renewAction={renewAction}
            renewPending={renewPending}
            loansKey={loansKey}
          />
        </div>
      ) : null}

      <ConfirmIssueDialog
        confirm={confirm}
        member={member}
        pending={pending}
        scanFieldRef={scanFieldRef}
        onCancel={() => setConfirm(null)}
        onConfirm={confirmIssue}
      />
    </div>
  );
}

/**
 * The scanned copy, before it becomes a loan.
 *
 * The counter is worked from a barcode, so nothing else on screen ever names
 * the book being issued — a copy scanned off the wrong pile, or a barcode that
 * read one digit wrong, would otherwise be discovered only when someone came
 * back with a book they were never given. This is the one place the librarian
 * can compare the copy in hand against the record before committing.
 *
 * The blocked cases are shown rather than hidden: "already on loan to X" tells
 * the librarian what to do next, where a disabled button with no explanation
 * does not.
 */
function ConfirmIssueDialog({
  confirm,
  member,
  pending,
  scanFieldRef,
  onCancel,
  onConfirm,
}: {
  confirm: Confirm | null;
  member: MemberHit | null;
  pending: boolean;
  scanFieldRef: React.RefObject<HTMLInputElement | null>;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const lookup = confirm?.lookup ?? null;
  const loading = confirm !== null && !lookup && !confirm.error;
  const canIssue = Boolean(lookup?.issuable) && !pending;

  /**
   * Enter confirms.
   *
   * Base UI would otherwise focus the first tabbable element, which is Cancel
   * — and the librarian's hands are on a scanner that ends every code with
   * Enter, so the reflex keystroke would throw the scan away. Focusing Issue
   * makes the confirm reachable without touching the mouse, which is the whole
   * reason the counter is scanner-driven.
   *
   * It is only pre-focused once the copy is confirmed issuable: pointing it at
   * a disabled button would leave nothing focused, and pre-focusing a
   * destructive-by-mistake action while the details are still loading would
   * let a fast Enter issue a book nobody has looked at yet.
   */
  const issueButtonRef = useRef<HTMLButtonElement>(null);

  // Moving focus IS the external-system update here — this is exactly the
  // "manually updating the DOM" case an effect is for.
  useEffect(() => {
    if (canIssue) issueButtonRef.current?.focus();
  }, [canIssue]);

  return (
    <Dialog
      open={confirm !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      {/* The dialog opens from a scan, not a trigger, so Base UI has no
          trigger to restore focus to on close. Pointing finalFocus at the scan
          field keeps the scanner loop working — otherwise focus lands on the
          body and the next scan is typed into nothing. */}
      <DialogContent
        className="sm:max-w-lg"
        finalFocus={scanFieldRef}
        // false, not the button ref: at open time the lookup is still in
        // flight and Issue is disabled, so a ref would resolve to nothing.
        // The effect below moves focus once the details land.
        initialFocus={false}
      >
        <DialogHeader>
          <DialogTitle>
            {confirm?.error ? "Copy not found" : "Issue this book?"}
          </DialogTitle>
          <DialogDescription>
            {member
              ? `Check the copy in hand, then issue it to ${member.fullName}.`
              : "Check the copy in hand before issuing."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-6">
            <Spinner className="text-muted-foreground size-4" />
            <span className="text-muted-foreground text-sm">
              Looking up{" "}
              <span className="font-mono">{confirm?.accession}</span>…
            </span>
          </div>
        ) : confirm?.error ? (
          <p className="text-overdue py-2 text-sm">{confirm.error}</p>
        ) : lookup ? (
          // Scrolls rather than growing: a fully catalogued title fills more
          // than a short screen, and a dialog taller than the viewport would
          // push the Issue button out of reach.
          <div className="-mx-1 flex max-h-[55vh] flex-col gap-4 overflow-y-auto px-1">
            <div className="flex flex-col gap-1.5">
              <span className="leading-tight font-semibold">{lookup.bookTitle}</span>
              <span className="text-muted-foreground text-sm">{lookup.author}</span>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                <Badge variant="outline">
                  {MATERIAL_CATEGORY_LABELS[lookup.category]}
                </Badge>
                <Badge
                  className={
                    lookup.issuable
                      ? "bg-available-subtle text-available"
                      : "bg-issued-subtle text-issued"
                  }
                >
                  {lookup.status}
                </Badge>
              </div>
            </div>

            {/* Two columns: these are short values being cross-checked against
                a book in hand, and one per row made the dialog scroll for no
                reason. Long values (title, publisher) stay full width above. */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-3">
              <Detail label="Accession number" value={lookup.accessionNumber} mono wrap />
              <Detail label="Condition" value={lookup.condition} wrap />
              <Detail label="Call number" value={lookup.callNo} mono wrap />
              <Detail label="Edition" value={lookup.edition} wrap />
              <Detail
                label="Year"
                value={lookup.year ? String(lookup.year) : null}
                wrap
              />
              <Detail label="Language" value={lookup.language} wrap />
              <Detail label="Department" value={lookup.department} wrap />
              <Detail
                label="Pages"
                value={lookup.totalPages ? String(lookup.totalPages) : null}
                wrap
              />
              <Detail label="ISBN" value={lookup.isbn} mono wrap />
            </div>

            <div className="flex flex-col gap-3 border-t pt-3">
              <Detail label="Publisher" value={lookup.publisher} wrap />
              {/* Last, and full width: it is the one field the librarian acts
                  on — it is where they walk to fetch the copy. */}
              <Detail label="Shelf location" value={lookup.shelfLocation} wrap />
            </div>

            {lookup.blockedReason ? (
              <p className="bg-overdue-subtle text-overdue rounded-lg p-3 text-sm">
                {lookup.blockedReason}
              </p>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button ref={issueButtonRef} onClick={onConfirm} disabled={!canIssue}>
            {pending ? <Spinner /> : null}
            Issue{member ? ` to ${member.fullName.split(" ")[0]}` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
      // One column on a phone: three cards cannot hold "Give a book to a
      // member" side by side, and the captions spilled over each other.
      className="grid w-full grid-cols-1 sm:grid-cols-3"
    >
      {MODES.map((m) => {
        const isActive = m.value === mode;

        return (
          <ToggleGroupItem
            key={m.value}
            value={m.value}
            className={cn(
              // whitespace-normal overrides the toggle's nowrap, which forced
              // the caption onto one line and let it spill across the card.
              "h-auto flex-col items-start gap-0.5 rounded-lg border px-3 py-2.5 text-left whitespace-normal",
              isActive
                ? "border-primary bg-primary/5 text-primary"
                : "border-border bg-card",
            )}
          >
            <span className="text-sm font-semibold">{m.label}</span>
            <span className="w-full text-xs leading-snug font-normal opacity-80">
              {m.caption}
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
  scanFieldRef,
}: {
  member: MemberHit | null;
  pending: boolean;
  nonce?: number;
  onScan: (value: string) => void;
  onSelectMember: (member: MemberHit) => void;
  onClearMember: () => void;
  scanFieldRef: React.RefObject<HTMLInputElement | null>;
}) {
  const atLimit = member ? member.booksOut >= member.maxBooks : false;

  return (
    <div className="flex flex-col gap-4">
      <Step n={1} label="Member" done={Boolean(member)}>
        {member ? (
          <LoadedMember member={member} onClear={onClearMember} />
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
            inputRef={scanFieldRef}
          />
        )}
      </Step>
    </div>
  );
}

/** One labelled field in the member panel. Dashes when there is no value. */
function Detail({
  label,
  value,
  mono,
  wrap,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
  /**
   * Let the value run onto a second line instead of truncating.
   *
   * The member rail truncates, because an overlong email there is still
   * identifiable from its first half. The confirmation dialog does not: an
   * ISBN or a shelf location is being read off the screen and compared to a
   * book in hand, and half of one is worse than useless.
   */
  wrap?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-muted-foreground text-[0.6875rem] font-medium tracking-wide uppercase">
        {label}
      </span>
      <span
        className={cn(
          "text-sm",
          wrap ? "wrap-break-word" : "truncate",
          mono && "font-mono",
          !value && "text-muted-foreground",
        )}
      >
        {value || "—"}
      </span>
    </div>
  );
}

/**
 * Step 1 once a member is loaded — a confirmation line, not the record.
 *
 * The full details now sit in the right-hand column, so repeating them here
 * would put the same six fields on screen twice and push step 2 — the scan
 * field, the thing actually being used — further down the page. This says
 * only "who is loaded, and how to change them".
 */
function LoadedMember({
  member,
  onClear,
}: {
  member: MemberHit;
  onClear: () => void;
}) {
  const atLimit = member.booksOut >= member.maxBooks;

  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <Avatar className="size-10 shrink-0">
        {member.photoUrl ? <AvatarImage src={member.photoUrl} alt="" /> : null}
        <AvatarFallback>{initials(member.fullName)}</AvatarFallback>
      </Avatar>

      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{member.fullName}</span>
        <span className="text-muted-foreground truncate text-xs">
          <span className="font-mono">{member.rollNumber ?? "—"}</span>
          {" · "}
          <span className={cn("tabular-nums", atLimit && "text-overdue font-medium")}>
            {member.booksOut}/{member.maxBooks} books
          </span>
        </span>
      </div>

      <Button variant="ghost" size="sm" onClick={onClear}>
        <XIcon />
        Change
      </Button>
    </div>
  );
}

/**
 * The loaded member's full record, in the right-hand column.
 *
 * Enter selects the top match without the librarian ever reading the list, so
 * this card is the only place a wrong match gets caught, and it has to carry
 * enough to catch it: the photo to check against the face, the roll number and
 * department to check against the ID card, the contact details to separate two
 * students who share a name. Every field is labelled rather than run together
 * in a dot-separated line — at a counter you are cross-checking against a card
 * in hand, and that is a lookup, not a read.
 *
 * Beside the scan field rather than below it, because both are used at the
 * same moment.
 */
function MemberDetailsCard({
  member,
  onClear,
}: {
  member: MemberHit;
  onClear: () => void;
}) {
  const atLimit = member.booksOut >= member.maxBooks;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col items-center gap-3 text-center">
          {/* Signed URL, so no next/image — the loader would need the host
              allow-listed and would cache a URL that expires in ten minutes. */}
          <Avatar className="size-28">
            {member.photoUrl ? <AvatarImage src={member.photoUrl} alt="" /> : null}
            <AvatarFallback className="text-2xl">
              {initials(member.fullName)}
            </AvatarFallback>
          </Avatar>

          <div className="flex min-w-0 flex-col items-center gap-1.5">
            <span className="text-lg leading-tight font-semibold">
              {member.fullName}
            </span>

            <div className="flex flex-wrap justify-center gap-1.5">
              {member.accountStatus === "pending" ? (
                <Badge className="bg-pending-subtle text-pending">
                  Awaiting approval
                </Badge>
              ) : null}
              {!member.isActive && member.accountStatus === "active" ? (
                <Badge variant="outline">Deactivated</Badge>
              ) : null}
              {member.owed > 0 ? (
                <Badge className="bg-overdue-subtle text-overdue">
                  ₹{member.owed.toFixed(2)} due
                </Badge>
              ) : null}
            </div>

            <p className="text-sm">
              <span className={cn("font-medium tabular-nums", atLimit && "text-overdue")}>
                {member.booksOut}/{member.maxBooks} books
              </span>{" "}
              <span className="text-muted-foreground">
                {atLimit ? "— at the limit" : "issued"}
              </span>
            </p>
          </div>
        </div>

        {/* The ID card, field by field. One column: this is a 22rem rail, and
            two columns would truncate an email to nothing. */}
        <div className="flex flex-col gap-3 border-t pt-4">
          <Detail label="Roll number" value={member.rollNumber} mono />
          <Detail label="Department" value={member.department} />
          <Detail
            label="Member type"
            value={member.memberType === "staff" ? "Faculty" : "Student"}
          />
          <Detail label="Email" value={member.email} />
          <Detail label="Phone" value={member.phone} mono />
          <Detail
            label="Outstanding"
            value={member.owed > 0 ? `₹${member.owed.toFixed(2)}` : "None"}
          />
        </div>

        <Button variant="outline" size="sm" onClick={onClear} className="w-full">
          <XIcon />
          Change member
        </Button>
      </CardContent>
    </Card>
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

  /**
   * The query `hits` actually describes.
   *
   * Enter has to tell "no member matches" apart from "the results for what you
   * just typed have not arrived yet" — an empty `hits` looks identical in both
   * cases, and taking the first row of a stale list would load the wrong
   * person. Ordinary typing never needs this; Enter does, because it can beat
   * the debounce.
   */
  const hitsFor = useRef("");

  /**
   * Set while Enter waits on an in-flight search, holding the exact query to
   * honour. A keystroke landing in that window abandons the pending pick
   * rather than selecting against a query already moved on from.
   */
  const pendingEnter = useRef<string | null>(null);

  // Debounced in the change handler rather than an effect: the search is a
  // response to typing, not a synchronisation with external state.
  function onQueryChange(value: string) {
    setQuery(value);

    if (debounce.current) clearTimeout(debounce.current);
    // Any further typing invalidates a queued Enter.
    pendingEnter.current = null;

    const q = value.trim();
    if (q.length < 2) {
      setHits([]);
      hitsFor.current = q;
      return;
    }

    debounce.current = setTimeout(() => runSearch(q), 220);
  }

  function runSearch(q: string) {
    startSearch(async () => {
      const rows = await searchMembers(q);

      // A slow request for an earlier query must not overwrite a newer one's
      // results: concurrent requests can settle out of order, and this field
      // is typed at fast enough to reach that.
      if (pendingEnter.current !== null && pendingEnter.current !== q) return;

      setHits(rows);
      hitsFor.current = q;

      // Enter was pressed before these landed — honour it now.
      if (pendingEnter.current === q) {
        pendingEnter.current = null;
        if (rows.length) select(rows[0]);
      }
    });
  }

  /**
   * Enter takes the first result.
   *
   * The first row is the right default because the list is ordered
   * active-then-pending then alphabetically, and a roll number — what gets
   * typed here — is effectively unique.
   *
   * Base UI only submits a *highlighted* item on Enter, and `autoHighlight`
   * highlights on input change, which is too early here: these results arrive
   * from the server a debounce later, so at keypress time there is often
   * nothing highlighted and nothing in the list. Hence selecting by hand.
   */
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;

    const q = query.trim();
    if (q.length < 2) return;

    e.preventDefault();

    if (hitsFor.current === q) {
      // Results are current — no reason to wait.
      if (hits.length) select(hits[0]);
      return;
    }

    // Typed and hit Enter faster than the debounce. Run the search now rather
    // than making them press Enter a second time, and select when it lands.
    pendingEnter.current = q;
    if (debounce.current) clearTimeout(debounce.current);
    runSearch(q);
  }

  function select(hit: MemberHit) {
    onSelect(hit);
    onQueryChange("");
  }

  useEffect(() => () => {
    if (debounce.current) clearTimeout(debounce.current);
  }, []);

  const typedEnough = query.trim().length >= 2;

  // Also true in the debounce window, where no request is in flight yet but
  // one is coming. Without it the popup flashes "No member matches" for 220ms
  // on every keystroke — reading as a failed search rather than an unfinished
  // one. `searching` alone starts too late to prevent that.
  const busy = searching || (typedEnough && hitsFor.current !== query.trim());

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
        select(hit);
      }}
      itemToStringLabel={(hit: MemberHit) => hit.fullName}
      // Highlights the top row, so it is visible that Enter has a target and
      // an arrow key moves off it. Enter itself is handled below — this fires
      // on input change, which is before the server results exist.
      autoHighlight
    >
      <ComboboxInput
        placeholder="Search name or roll number"
        showTrigger={false}
        autoFocus
        aria-label="Search members"
        onKeyDown={onKeyDown}
      />

      <ComboboxContent>
        <ComboboxEmpty>
          {busy
            ? "Searching…"
            : typedEnough
              ? `No member matches “${query.trim()}”.`
              : "Type at least two characters."}
        </ComboboxEmpty>

        <ComboboxList>
          {(hit: MemberHit) => (
            <ComboboxItem key={hit.id} value={hit} className="items-start gap-2.5 py-1.5">
              {/* Same verification cue as the loaded panel, so a librarian who
                  does open the list picks by face, not by name alone. */}
              <Avatar className="size-8 shrink-0">
                {hit.photoUrl ? <AvatarImage src={hit.photoUrl} alt="" /> : null}
                <AvatarFallback className="text-xs">
                  {initials(hit.fullName)}
                </AvatarFallback>
              </Avatar>
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
  renewAction,
  renewPending,
  loansKey,
}: {
  member: MemberHit;
  renewAction: (formData: FormData) => void;
  renewPending: boolean;
  loansKey: number;
}) {
  const pending = member.accountStatus === "pending";

  // The name, photo and counts live in the details card above this one; this
  // carries only what that cannot — the approval warning, and the books they
  // hold. Clearing the member is that card's "Change member" button, so there
  // is deliberately no second control for it here.
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
              , which allows {member.maxBooks} books. Scanning a book will
              approve this account and issue in one step.
            </p>
          </div>
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
        {/* No direction: the scan field is beside this on a wide screen and
            above it on a narrow one. */}
        <EmptyDescription>Scan a book to issue it.</EmptyDescription>
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
