export type Role = "librarian" | "member";
export type MemberType = "student" | "staff";
export type AccountStatus = "pending" | "active" | "rejected";
export type CopyStatus = "available" | "issued" | "lost" | "damaged";

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
