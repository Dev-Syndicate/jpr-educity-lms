"use client";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { ActionState } from "@/lib/types";

/** Top-of-form message for a settled action. */
export function FormFeedback({ state }: { state: ActionState<unknown> }) {
  if (!state.message) return null;

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
