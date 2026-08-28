import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useWorkspaceSetter } from "@/hooks/use-workspace";
import { useToast } from "@/components/ui/toast";

export type PendingInvitation = {
  id: string;
  orgId: string;
  invitedEmail: string;
  role: string;
  status: string;
  expiresAt: string;
  token: string;
  org: { id: string; name: string; type: "team" | "enterprise" } | null;
  inviter: { id: string; displayName: string; email: string } | null;
};

function usePending() {
  return useQuery<{ invitations: PendingInvitation[] }>({
    queryKey: ["invitations", "pending"],
    queryFn: () => api.get<{ invitations: PendingInvitation[] }>("/api/invitations/pending"),
    staleTime: 30_000,
  });
}

export function PendingInvitations() {
  const { data, isLoading } = usePending();
  const setActive = useWorkspaceSetter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const accept = useMutation({
    mutationFn: (token: string) => api.post<{ invitation: any; orgId: string }>(
      `/api/invitations/${token}/accept`,
    ),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["invitations", "pending"] });
      queryClient.invalidateQueries({ queryKey: ["organization", "mine"] });
      const org = res?.invitation?.org;
      if (res?.orgId && org) {
        setActive({
          type: "org",
          orgId: res.orgId,
          orgName: org.name,
          orgType: org.type,
          role: res.invitation?.role || "member",
        });
        toast({ title: "Welcome!", description: `You joined ${org.name}.` });
      }
    },
    onError: (e) => toast({ title: "Could not accept", description: String(e) }),
  });

  const decline = useMutation({
    mutationFn: (token: string) => api.post(`/api/invitations/${token}/decline`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invitations", "pending"] });
      toast({ title: "Invitation declined" });
    },
    onError: (e) => toast({ title: "Could not decline", description: String(e) }),
  });

  const invitations = data?.invitations ?? [];

  if (isLoading) {
    return <div className="text-xs text-muted-foreground py-2">Loading invitations…</div>;
  }
  if (invitations.length === 0) {
    return null;
  }

  return (
    <div className="rounded-md border border-primary/40 bg-primary/5 p-3 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-primary">
        {invitations.length} pending invitation{invitations.length === 1 ? "" : "s"}
      </p>
      {invitations.map((inv) => (
        <div key={inv.id} className="flex items-center justify-between gap-2 bg-background/60 rounded px-2 py-2">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">
              {inv.org?.name ?? "Unknown organization"}
              <span className="ml-2 text-[10px] uppercase text-muted-foreground">
                {inv.org?.type ?? "team"} · {inv.role}
              </span>
            </p>
            <p className="text-[10px] text-muted-foreground">
              Invited by {inv.inviter?.displayName ?? "someone"} · expires {new Date(inv.expiresAt).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Link
              to={`/invitations/${inv.token}`}
              className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              View
            </Link>
            <button
              type="button"
              onClick={() => decline.mutate(inv.token)}
              disabled={decline.isPending}
              className="h-7 px-2 text-xs border border-outline rounded hover:bg-accent"
            >
              Decline
            </button>
            <button
              type="button"
              onClick={() => accept.mutate(inv.token)}
              disabled={accept.isPending}
              className="h-7 px-2 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {accept.isPending ? "…" : "Accept"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
