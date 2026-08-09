"use client";

import { useActionState } from "react";

import { FormFeedback } from "@/components/form-feedback";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { setMemberActive } from "@/lib/actions/members";
import { idleState } from "@/lib/types";

export function MemberStatusToggle({
  memberId,
  active,
}: {
  memberId: string;
  active: boolean;
}) {
  const [state, action, pending] = useActionState(setMemberActive, idleState);

  return (
    <div className="flex flex-col items-end gap-2">
      <form action={action}>
        <input type="hidden" name="memberId" value={memberId} />
        <input type="hidden" name="active" value={active ? "false" : "true"} />
        <Button type="submit" variant="outline" disabled={pending}>
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
