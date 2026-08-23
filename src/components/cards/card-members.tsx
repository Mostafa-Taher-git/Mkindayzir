"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

interface CardMembersProps {
  cardId: string;
  boardId: string;
}

function CardMembers({ cardId }: CardMembersProps) {
  const queryClient = useQueryClient();
  const [userId, setUserId] = React.useState("");

  const { data } = useQuery({
    queryKey: ["card-members", cardId],
    queryFn: async () => {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/cards/${cardId}/members`, {
        cache: "no-store",
      });
      if (!res.ok) return { members: [] };
      return res.json();
    },
  });

  const { data: usersData } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/users`, {
        cache: "no-store",
      });
      if (!res.ok) return { users: [] };
      return res.json();
    },
  });

  const members = data?.members ?? [];
  const users = usersData?.users ?? [];

  const addMutation = useMutation({
    mutationFn: async (uid: string) => {
      const res = await fetch(`/api/cards/${cardId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uid }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Failed to add member" }));
        throw new Error(error.message);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["card-members", cardId] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (uid: string) => {
      const res = await fetch(`/api/cards/${cardId}/members/${uid}`, { method: "DELETE" });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Failed to remove member" }));
        throw new Error(error.message);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["card-members", cardId] });
    },
  });

  const handleAdd = () => {
    if (userId) {
      addMutation.mutate(userId);
      setUserId("");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <select
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="border-input data-[state=open]:border-ring flex h-9 flex-1 rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs"
        >
          <option value="">Select user...</option>
          {users.map((user: { id: string; displayName: string }) => (
            <option key={user.id} value={user.id}>{user.displayName}</option>
          ))}
        </select>
        <Button onClick={handleAdd} disabled={!userId || addMutation.isPending}>
          {addMutation.isPending ? "Adding..." : "Add"}
        </Button>
      </div>

      <div className="space-y-2">
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">No members assigned.</p>
        ) : (
          members.map((member: { id: string; user?: { displayName: string; avatar: string | null }; userId: string }) => (
            <div key={member.id} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Avatar className="h-6 w-6">
                  <AvatarImage src={member.user?.avatar ?? ""} alt={member.user?.displayName ?? ""} />
                  <AvatarFallback className="text-xs">
                    {member.user?.displayName?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) ?? "?"}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm">{member.user?.displayName ?? "Unknown"}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeMutation.mutate(member.userId)}
                disabled={removeMutation.isPending}
              >
                Remove
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export { CardMembers };
