import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";

export type Member = {
  id: string;
  orgId: string;
  userId: string;
  role: "owner" | "admin";
  invitedBy: string | null;
  joinedAt: string;
  user: {
    id: string;
    displayName: string;
    email: string;
    avatar: string | null;
  };
};

const ROLE_OPTIONS = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
];

export function OrgMembers({ orgId, isOwner, myUserId, onLeave, onDelete }: {
  orgId: string;
  isOwner: boolean;
  myUserId: string;
  onLeave: () => void;
  onDelete: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [transferTo, setTransferTo] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ members: Member[] }>({
    queryKey: ["organization", "members", orgId],
    queryFn: () => api.get<{ members: Member[] }>(`/api/organizations/${orgId}/members`),
  });

  const setRole = useMutation({
    mutationFn: (vars: { userId: string; role: string }) =>
      api.patch(`/api/organizations/${orgId}/members/${vars.userId}`, { role: vars.role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization", "members", orgId] });
      toast({ title: "Role updated" });
    },
    onError: (e) => toast({ title: "Could not change role", description: String(e) }),
  });

  const remove = useMutation({
    mutationFn: (userId: string) => api.delete(`/api/organizations/${orgId}/members/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization", "members", orgId] });
      toast({ title: "Member removed" });
    },
    onError: (e) => toast({ title: "Could not remove", description: String(e) }),
  });

  const transfer = useMutation({
    mutationFn: (userId: string) => api.post(`/api/organizations/${orgId}/transfer-ownership`, { userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization", "members", orgId] });
      queryClient.invalidateQueries({ queryKey: ["organization", "mine"] });
      setTransferTo(null);
      toast({ title: "Ownership transferred" });
    },
    onError: (e) => toast({ title: "Could not transfer", description: String(e) }),
  });

  if (isLoading) return <p className="text-xs text-muted-foreground py-2">Loading members…</p>;
  const members = data?.members ?? [];

  return (
    <div className="space-y-2">
      {members.map((m) => {
        const isMe = m.userId === myUserId;
        const isTargetOwner = isOwner; // We only know isOwner for the current user, so role dropdown logic uses that.
        return (
          <div key={m.id} className="flex items-center justify-between gap-2 border border-outline rounded-md px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {m.user.displayName}
                {isMe && <span className="ml-2 text-[10px] uppercase text-muted-foreground">you</span>}
                {transferTo === m.userId && (
                  <span className="ml-2 text-[10px] uppercase text-primary">new owner pending</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground truncate">{m.user.email}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isOwner ? (
                <select
                  value={m.role}
                  onChange={(e) => setRole.mutate({ userId: m.userId, role: e.target.value })}
                  className="h-7 px-2 text-xs rounded-md border bg-transparent"
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              ) : (
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground border border-outline rounded px-2 py-1">
                  {m.role}
                </span>
              )}

              {isOwner && !isMe && transferTo !== m.userId && (
                <button
                  type="button"
                  onClick={() => setTransferTo(m.userId)}
                  className="h-7 px-2 text-xs border border-outline rounded hover:bg-accent"
                >
                  Make owner
                </button>
              )}

              {transferTo === m.userId && (
                <>
                  <button
                    type="button"
                    onClick={() => transfer.mutate(m.userId)}
                    disabled={transfer.isPending}
                    className="h-7 px-2 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    {transfer.isPending ? "…" : "Confirm"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTransferTo(null)}
                    className="h-7 px-2 text-xs border border-outline rounded hover:bg-accent"
                  >
                    Cancel
                  </button>
                </>
              )}

              {isOwner && !isMe && transferTo !== m.userId && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Remove ${m.user.displayName}?`)) {
                      remove.mutate(m.userId);
                    }
                  }}
                  className="h-7 px-2 text-xs text-destructive border border-destructive/40 rounded hover:bg-destructive/10"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        );
      })}

      <div className="flex items-center gap-2 pt-2 border-t border-outline">
        {!isOwner && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Leave this organization? Your contributed data stays with the org.")) {
                onLeave();
              }
            }}
            className="h-8 px-3 text-xs border border-outline rounded hover:bg-accent"
          >
            Leave organization
          </button>
        )}
        {isOwner && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Delete this organization? This cannot be undone.")) {
                onDelete();
              }
            }}
            className="h-8 px-3 text-xs text-destructive border border-destructive/40 rounded hover:bg-destructive/10"
          >
            Delete organization
          </button>
        )}
      </div>
    </div>
  );
}
