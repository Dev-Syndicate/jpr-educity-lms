export type Role = "librarian" | "member";
export type MemberType = "student" | "staff";
export type AccountStatus = "pending" | "active" | "rejected";
export type CopyStatus = "available" | "issued" | "lost" | "damaged";

/** What kind of item a title is. Mirrors the material_category enum. */
export type MaterialCategory =
  | "book"
  | "non_book_material"
  | "project"
  | "thesis"
  | "proceeding"
  | "magazine";

/**
 * Display names for the category enum, in the order they should appear in a
 * dropdown. Declared once here so the form, the table and the detail page
 * cannot drift apart — and so a value added to the enum surfaces as a
 * TypeScript error here rather than as a raw "non_book_material" on screen.
 */
export const MATERIAL_CATEGORY_LABELS: Record<MaterialCategory, string> = {
  book: "Book",
  non_book_material: "Non-book material",
  project: "Project",
  thesis: "Thesis",
  proceeding: "Proceeding",
  magazine: "Magazine",
};

export const MATERIAL_CATEGORIES = Object.keys(
  MATERIAL_CATEGORY_LABELS,
) as MaterialCategory[];

/**
 * The categories that carry a project number, a student list, and a degree
 * and batch (PRD B-11).
 *
 * Declared once here because three places need the same answer — the form
 * decides whether to show the section, the action decides whether to save it,
 * and the detail page decides whether to display it. Three separate
 * `=== "project" || === "thesis"` checks would eventually disagree, and the
 * database constraint would then reject a save the form had allowed.
 */
export const PROJECT_CATEGORIES = ["project", "thesis"] as const;

export type ProjectCategory = (typeof PROJECT_CATEGORIES)[number];

export function isProjectCategory(
  category: MaterialCategory | null | undefined,
): category is ProjectCategory {
  return (
    category != null && PROJECT_CATEGORIES.includes(category as ProjectCategory)
  );
}

/** One student on a project or thesis. Mirrors a project_authors row. */
export type ProjectAuthor = {
  rollNumber: string;
  fullName: string;
};

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  memberType: MemberType | null;
  accountStatus: AccountStatus;
  rollNumber: string | null;
  isActive: boolean;
};

/**
 * Shared return shape for every Server Action, consumed by useActionState.
 */
export type ActionState<T = undefined> = {
  ok: boolean;
  /** Top-level message. RPC exception text is safe to show verbatim. */
  message?: string;
  /** Per-field errors from zod. */
  fieldErrors?: Record<string, string[]>;
  data?: T;
  /**
   * Changes on every settled action.
   *
   * Without it, submitting the same bad barcode twice produces a deeply-equal
   * state object, React bails out of re-rendering, and the error banner does
   * not re-flash — so the librarian thinks nothing happened.
   */
  nonce?: number;
};

/**
 * Starting state for useActionState.
 *
 * Typed as ActionState<never> so it is assignable to ActionState<T> for any T
 * — `data` is absent, so no result type is being claimed.
 */
export const idleState: ActionState<never> = { ok: false };

export function failure<T = undefined>(
  message: string,
  fieldErrors?: Record<string, string[]>,
): ActionState<T> {
  return { ok: false, message, fieldErrors, nonce: Date.now() };
}

export function success<T>(data: T, message?: string): ActionState<T> {
  return { ok: true, data, message, nonce: Date.now() };
}
