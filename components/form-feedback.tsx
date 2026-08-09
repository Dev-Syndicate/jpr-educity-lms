"use client";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useActionToast } from "@/components/use-action-toast";
import type { ActionState } from "@/lib/types";

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
}: {
  state: ActionState<unknown>;
  toastOnly?: boolean;
}) {
  useActionToast(state);

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
