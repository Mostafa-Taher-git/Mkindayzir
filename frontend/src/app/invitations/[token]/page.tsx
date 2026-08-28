import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspaceSetter } from "@/hooks/use-workspace";
import { useToast } from "@/components/ui/toast";
import { DataPicker } from "@/components/organizations/data-picker";

type InvitationDetail = {
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

export default function InvitationPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading } = useAuth();
  const setActive = useWorkspaceSetter();
  const { toast } = useToast();
  const [responded, setResponded] = useState<"accepted" | "declined" | null>(null);
  const [showTransfer, setShowTransfer] = useState(false);
  const [acceptedOrgId, setAcceptedOrgId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<{ invitations: InvitationDetail[] }>({
    queryKey: ["invitations", "pending"],
    queryFn: () => api.get<{ invitations: InvitationDetail[] }>("/api/invitations/pending"),
    enabled: Boolean(token),
    retry: false,
  });

  const inv = (data?.invitations ?? []).find((i) => (i as InvitationDetail).token === token);

  const accept = useMutation({
    mutationFn: () => api.post<{ invitation: any; orgId: string }>(`/api/invitations/${token}/accept`),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["invitations", "pending"] });
      queryClient.invalidateQueries({ queryKey: ["organization", "mine"] });
      setResponded("accepted");
      const org = res?.invitation?.org;
      if (res?.orgId && org) {
        setActive({
          type: "org",
          orgId: res.orgId,
          orgName: org.name,
          orgType: org.type,
          role: res.invitation?.role || "member",
        });
        setAcceptedOrgId(res.orgId);
        setShowTransfer(true);
      }
    },
    onError: (e) => toast({ title: "Could not accept", description: String(e) }),
  });

  const decline = useMutation({
    mutationFn: () => api.post(`/api/invitations/${token}/decline`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invitations", "pending"] });
      setResponded("declined");
      setTimeout(() => navigate("/"), 1500);
    },
    onError: (e) => toast({ title: "Could not decline", description: String(e) }),
  });

  if (authLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-lg border border-outline bg-surface p-6 text-center">
          <h1 className="text-xl font-bold mb-2">You're invited to join an organization</h1>
          <p className="text-sm text-muted-foreground mb-4">
            Please sign in or create an account with the invited email to accept.
          </p>
          <Link
            to={`/login?return=/invitations/${token}`}
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary text-primary-foreground px-4 text-sm font-medium hover:bg-primary/90 no-underline"
          >
            Continue to sign in
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading invitation…</div>;
  }

  if (error || !inv) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-lg border border-outline bg-surface p-6 text-center">
          <h1 className="text-xl font-bold mb-2">Invitation not found</h1>
          <p className="text-sm text-muted-foreground mb-4">
            This invitation may have expired, been revoked, or was sent to a different email.
          </p>
          <Link
            to="/"
            className="inline-flex h-9 items-center justify-center rounded-md border border-outline px-4 text-sm font-medium hover:bg-accent no-underline"
          >
            Go home
          </Link>
        </div>
      </div>
    );
  }

  const expired = inv ? new Date(inv.expiresAt) < new Date() : false;
  const notPending = inv ? inv.status !== "pending" : false;
  const wrongEmail = inv && user ? inv.invitedEmail.toLowerCase() !== user.email.toLowerCase() : false;

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg border border-outline bg-surface p-6">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {inv.org?.type === "enterprise" ? "Enterprise" : "Team"} invitation
        </p>
        <h1 className="text-2xl font-bold mt-1">{inv.org?.name ?? "Organization"}</h1>
        <p className="text-sm text-muted-foreground mt-2">
          {inv.inviter?.displayName ?? "Someone"} invited you to join as a {inv.role}.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Invitation sent to: <span className="font-mono">{inv.invitedEmail}</span>
        </p>
        {responded === "accepted" ? (
          <div className="mt-6 p-3 rounded-md bg-primary/10 border border-primary/30 text-sm">
            Welcome! Taking you to the dashboard…
          </div>
        ) : responded === "declined" ? (
          <div className="mt-6 p-3 rounded-md bg-muted border border-outline text-sm">
            Invitation declined.
          </div>
        ) : expired || notPending ? (
          <div className="mt-6 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-sm">
            This invitation is {inv.status} and can no longer be used.
          </div>
        ) : wrongEmail ? (
          <div className="mt-6 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-sm">
            You're signed in as <span className="font-mono">{user.email}</span> but this invitation is for{" "}
            <span className="font-mono">{inv.invitedEmail}</span>. Sign in with the invited email to accept.
          </div>
        ) : (
          <div className="mt-6 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => decline.mutate()}
              disabled={decline.isPending || accept.isPending}
              className="h-9 px-4 rounded-md border border-outline text-sm hover:bg-accent"
            >
              Decline
            </button>
            <button
              type="button"
              onClick={() => accept.mutate()}
              disabled={accept.isPending || decline.isPending}
              className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {accept.isPending ? "Accepting…" : "Accept"}
            </button>
          </div>
        )}

        <p className="text-[10px] text-muted-foreground mt-6 text-center">
          Expires {new Date(inv.expiresAt).toLocaleString()}
        </p>
      </div>

      {showTransfer && acceptedOrgId && (
        <DataPicker
          direction="to_org"
          orgId={acceptedOrgId}
          open={showTransfer}
          onOpenChange={(open) => {
            setShowTransfer(open);
            if (!open) setTimeout(() => navigate("/"), 800);
          }}
        />
      )}
    </div>
  );
}
