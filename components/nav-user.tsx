"use client";

import { LogOutIcon } from "lucide-react";
import { useTransition } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { signOut } from "@/lib/actions/auth";
import type { CurrentUser } from "@/lib/types";
import { initials } from "@/lib/utils";


/**
 * Who is signed in, and the one action available to them.
 *
 * Previously a dropdown holding a single item, which cost a click and gave no
 * sign that anything was behind it — the row looked like a caption. Sign out
 * is the only thing here, so it is a visible button.
 */
export function NavUser({ user }: { user: CurrentUser }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2 px-1">
      <Avatar className="size-8 shrink-0 rounded-lg">
        <AvatarFallback className="rounded-lg text-xs">
          {initials(user.fullName)}
        </AvatarFallback>
      </Avatar>

      <div className="grid min-w-0 flex-1 text-left leading-tight">
        <span className="truncate text-sm font-medium">{user.fullName}</span>
        <span className="text-sidebar-foreground/60 truncate text-xs">
          {user.email}
        </span>
      </div>

      {/* Icon only, so it sits on the same row as the identity. The label
          lives in aria-label and the tooltip rather than on screen — a
          door-with-arrow is well understood, and this is the only action
          here. */}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              onClick={() => startTransition(() => signOut())}
              disabled={pending}
              aria-label="Sign out"
              className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground shrink-0"
            >
              {pending ? <Spinner /> : <LogOutIcon />}
            </Button>
          }
        />
        <TooltipContent side="right">Sign out</TooltipContent>
      </Tooltip>
    </div>
  );
}
