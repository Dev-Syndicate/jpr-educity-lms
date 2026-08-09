"use client";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useActionToast } from "@/components/use-action-toast";
import { idleState, type ActionState } from "@/lib/types";

/** Stable reference, so suppressing the toast never re-fires the effect. */
const IDLE = idleState;

/**
 * Announce a settled action.
 *
 * Every form already renders this, so raising the toast from here means one
 * place decides how results are announced rather than a dozen call sites.
 *
 * `toastOnly` drops the inline alert for actions whose result is already
 * obvious in the page — a row disappearing, a count changing — where an
 * inline banner would just push the layout around.
 */
export function FormFeedback({
  state,
  toastOnly = false,
  inlineOnly = false,
}: {
  state: ActionState<unknown>;
  toastOnly?: boolean;
  /**
   * Suppress the toast. For a form the user is still filling in, where the
   * message belongs beside the fields being corrected rather than floating
   * in a corner and timing out.
   */
  inlineOnly?: boolean;
}) {
  useActionToast(inlineOnly ? IDLE : state);

  if (!state.message || toastOnly) return null;

  return (
    <Alert
      key={state.nonce}
      variant={state.ok ? "default" : "destructive"}
      role="status"
      className={state.ok ? "border-available text-available" : undefined}
    >
      <AlertTitle>{state.message}</AlertTitle>
    </Alert>
  );
}

/** Submit button with a pending spinner. */
export function SubmitButton({
  pending,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { pending: boolean }) {
  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending ? <Spinner /> : null}
      {children}
    </Button>
  );
}

/** Turn zod field errors into the shape FieldError expects. */
export function fieldErrors(state: ActionState<unknown>, name: string) {
  return state.fieldErrors?.[name]?.map((message) => ({ message }));
}
