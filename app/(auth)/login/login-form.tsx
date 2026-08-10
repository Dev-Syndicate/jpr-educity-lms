"use client";

import { useActionState } from "react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { signIn } from "@/lib/actions/auth";
import { idleState } from "@/lib/types";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signIn, idleState);

  return (
    <form action={action} className="flex flex-col gap-6">
      <FieldGroup>
        {state.message ? (
          <Alert variant="destructive" role="alert">
            <AlertTitle>{state.message}</AlertTitle>
          </Alert>
        ) : null}

        {next ? <input type="hidden" name="next" value={next} /> : null}

        <Field data-invalid={state.fieldErrors?.email ? true : undefined}>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
            autoFocus
            aria-invalid={state.fieldErrors?.email ? true : undefined}
          />
          <FieldError
            errors={state.fieldErrors?.email?.map((m) => ({ message: m }))}
          />
        </Field>

        <Field data-invalid={state.fieldErrors?.password ? true : undefined}>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            aria-invalid={state.fieldErrors?.password ? true : undefined}
          />
          <FieldError
            errors={state.fieldErrors?.password?.map((m) => ({ message: m }))}
          />
          {/* Still the counter, and now that is a real answer: a librarian can
              issue a new temporary password from the member's page. There is
              no emailed reset link because no SMTP is configured. */}
          <FieldDescription>
            Forgotten it? Ask at the library counter for a new one.
          </FieldDescription>
        </Field>

        <Field>
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? <Spinner /> : null}
            Sign in
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}
