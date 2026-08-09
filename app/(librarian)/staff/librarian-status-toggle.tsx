"use client";

import { useActionState } from "react";

import { FormFeedback } from "@/components/form-feedback";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { setLibrarianActive } from "@/lib/actions/staff";
import { idleState } from "@/lib/types";

export function LibrarianStatusToggle({
  librarianId,
  active,
  isSelf,
}: {
  librarianId: string;
  active: boolean;
  isSelf: boolean;
}) {
  const [state, action, pending] = useActionState(setLibrarianActive, idleState);

  // PRD S-3: no self-deactivation, or you lock yourself out. The action
  // refuses this too — hiding the control is only a courtesy.
  if (isSelf) {
    return <span className="text-muted-foreground text-sm">This is you</span>;
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <form action={action}>
        <input type="hidden" name="librarianId" value={librarianId} />
        <input type="hidden" name="active" value={active ? "false" : "true"} />
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? <Spinner /> : null}
          {active ? "Deactivate" : "Reactivate"}
        </Button>
      </form>

      {state.message ? (
        <div className="w-full max-w-sm">
          <FormFeedback state={state} />
        </div>
      ) : null}
    </div>
  );
}
