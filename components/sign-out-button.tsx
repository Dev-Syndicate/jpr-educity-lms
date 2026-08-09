"use client";

import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { signOut } from "@/lib/actions/auth";

export function SignOutButton() {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(() => signOut())}
    >
      {pending ? <Spinner /> : null}
      Sign out
    </Button>
  );
}
