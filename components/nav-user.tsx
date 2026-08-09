"use client";

import { LogOutIcon } from "lucide-react";
import { useTransition } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { signOut } from "@/lib/actions/auth";
import type { CurrentUser } from "@/lib/types";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

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
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-1">
        <Avatar className="size-8 rounded-lg">
          <AvatarFallback className="rounded-lg text-xs">
            {initials(user.fullName)}
          </AvatarFallback>
        </Avatar>
        <div className="grid flex-1 text-left leading-tight">
          <span className="truncate text-sm font-medium">{user.fullName}</span>
          <span className="text-sidebar-foreground/60 truncate text-xs">
            {user.email}
          </span>
        </div>
      </div>

      <SidebarMenuButton
        onClick={() => startTransition(() => signOut())}
        disabled={pending}
        className="border-sidebar-border justify-center border"
      >
        {pending ? <Spinner /> : <LogOutIcon />}
        <span>Sign out</span>
      </SidebarMenuButton>
    </div>
  );
}
