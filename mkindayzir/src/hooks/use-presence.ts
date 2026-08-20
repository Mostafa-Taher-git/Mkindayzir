"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useSocket } from "./use-socket";
import { joinEntityRoom, leaveEntityRoom } from "@/lib/realtime";

export type PresenceUser = {
  userId: string;
  displayName: string;
  avatar?: string;
  entityType: string;
  entityId: string;
  joinedAt: number;
};

export type UsePresenceReturn = {
  presentUsers: PresenceUser[];
  isPresent: (userId: string) => boolean;
};

export function usePresence(entityType: string, entityId: string): UsePresenceReturn {
  const { data: session } = useSession();
  const { socket, connected, onAny } = useSocket(session?.user?.id ?? null);
  const [users, setUsers] = useState<PresenceUser[]>([]);

  const currentUserId = session?.user?.id;

  useEffect(() => {
    if (!currentUserId || !connected || !socket) return;

    const displayName = session.user.displayName ?? "User";
    const avatar = session.user.image ?? undefined;

    joinEntityRoom(socket, entityType, entityId, currentUserId);

    setUsers((prev) => {
      const existing = prev.find((u) => u.userId === currentUserId);
      if (existing) return prev;
      return [
        ...prev,
        {
          userId: currentUserId,
          displayName,
          avatar,
          entityType,
          entityId,
          joinedAt: Date.now(),
        },
      ];
    });

    const unsubscribe = onAny((event, data) => {
      if (event === "presence:update") {
        const payload = data as {
          userId: string;
          entityType: string;
          entityId: string;
          action: "join" | "leave";
          displayName?: string;
          avatar?: string;
        };

        if (payload.entityType !== entityType || payload.entityId !== entityId) return;

        setUsers((prev) => {
          if (payload.action === "join") {
            if (prev.some((u) => u.userId === payload.userId)) return prev;
            return [
              ...prev,
              {
                userId: payload.userId,
                displayName: payload.displayName ?? "User",
                avatar: payload.avatar,
                entityType,
                entityId,
                joinedAt: Date.now(),
              },
            ];
          }

          if (payload.action === "leave") {
            return prev.filter((u) => u.userId !== payload.userId);
          }

          return prev;
        });
      }
    });

    return () => {
      if (socket) {
        leaveEntityRoom(socket, entityType, entityId, currentUserId);
      }
      unsubscribe();
      setUsers((prev) => prev.filter((u) => u.userId !== currentUserId));
    };
  }, [currentUserId, connected, entityType, entityId, socket, session?.user, onAny]);

  const isPresent = useMemo(
    () => (userId: string) => users.some((u) => u.userId === userId),
    [users]
  );

  return { presentUsers: users, isPresent };
}
