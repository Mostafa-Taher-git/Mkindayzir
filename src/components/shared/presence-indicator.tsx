"use client";

import * as React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PresenceUser } from "@/hooks/use-presence";
import { PresenceDialog } from "./presence-dialog";

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function PresenceIndicator({
  users,
  max = 4,
  size = "md",
  currentUserId,
}: {
  users: PresenceUser[];
  max?: number;
  size?: "sm" | "md" | "lg";
  currentUserId: string;
}) {
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const sizeClasses = {
    sm: "h-6 w-6 text-xs",
    md: "h-8 w-8 text-sm",
    lg: "h-10 w-10 text-base",
  };

  const others = users.filter((u) => u.userId !== currentUserId);
  const visible = others.slice(0, max);
  const remaining = others.length - max;

  if (others.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        className="flex items-center -space-x-2 focus:outline-none"
        aria-label={`${others.length} viewer${others.length !== 1 ? "s" : ""}`}
      >
        {visible.map((user) => (
          <Avatar
            key={user.userId}
            className={`${sizeClasses[size]} border-2 border-background ring-1 ring-border`}
          >
            <AvatarImage src={user.avatar ?? ""} alt={user.displayName} />
            <AvatarFallback>{getInitials(user.displayName)}</AvatarFallback>
          </Avatar>
        ))}
        {remaining > 0 && (
          <div
            className={`flex items-center justify-center rounded-full border-2 border-background bg-muted text-xs font-medium text-muted-foreground ring-1 ring-border ${sizeClasses[size]}`}
          >
            +{remaining}
          </div>
        )}
      </button>
      <PresenceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        users={users}
        currentUserId={currentUserId}
      />
    </>
  );
}

export { PresenceIndicator };
