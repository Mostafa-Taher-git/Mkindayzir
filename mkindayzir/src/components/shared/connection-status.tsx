"use client";

import * as React from "react";
import { useSocket } from "@/hooks/use-socket";
import { useSession } from "next-auth/react";

function ConnectionStatusInner() {
  const { data: session } = useSession();
  const { status } = useSocket(session?.user?.id ?? null);

  const colorClass =
    status === "connected"
      ? "bg-emerald-500"
      : status === "reconnecting"
        ? "bg-amber-500"
        : "bg-red-500";

  return (
    <span className="relative inline-flex items-center gap-2 text-xs text-muted-foreground">
      <span className="relative flex h-2.5 w-2.5">
        {status === "reconnecting" && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
        )}
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${colorClass}`} />
      </span>
      <span className="hidden sm:inline capitalize">{status}</span>
    </span>
  );
}

export { ConnectionStatusInner as ConnectionStatus };
