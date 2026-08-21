"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "./use-auth";
import { useWebSocket } from "./use-socket";

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
  const { user } = useAuth();
  const { ws, connected, onAny } = useWebSocket(user?.id ?? null);
  const [users, setUsers] = useState<PresenceUser[]>([]);

  const currentUserId = user?.id;

  useEffect(() => {
    if (!currentUserId || !connected || !ws) return;

    const displayName = user.displayName ?? "User";
    const avatar = user.avatar ?? undefined;

    ws.send(JSON.stringify({
      type: 'join',
      entityType,
      entityId,
      userId: currentUserId,
    }));

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
      if (ws) {
        ws.send(JSON.stringify({
          type: 'leave',
          entityType,
          entityId,
          userId: currentUserId,
        }));
      }
      unsubscribe();
      setUsers((prev) => prev.filter((u) => u.userId !== currentUserId));
    };
  }, [currentUserId, connected, entityType, entityId, ws, user, onAny]);

  const isPresent = useMemo(
    () => (userId: string) => users.some((u) => u.userId === userId),
    [users]
  );

  return { presentUsers: users, isPresent };
}
