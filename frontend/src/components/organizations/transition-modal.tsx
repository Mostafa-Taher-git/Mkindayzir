import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { useMyOrg } from "@/hooks/use-workspace";

type Member = {
  id: string;
  orgId: string;
  userId: string;
  role: "admin" | "manager" | "member" | "viewer";
  user: { id: string; displayName: string; email: string };
};

interface TransitionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  myUserId: string;
}

export function TransitionModal({ open, onOpenChange, myUserId }: TransitionModalProps) {
  const { data: myOrg } = useMyOrg();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const org = myOrg?.organization ?? null;
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const target = org?.orgType === "team" ? "enterprise" : "team";

  const { data, isLoading } = useQuery<{ members: Member[] }>({
    queryKey: ["organization", "members", org?.id],
    queryFn: () => api.get<{ members: Member[] }>(`/api/organizations/${org!.id}/members`),
    enabled: Boolean(org?.id) && open,
  });

  useEffect(() => {
    if (open) setExcluded(new Set());
  }, [open]);

  const transition = useMutation({
    mutationFn: () => api.post<{ organization: any }>(
      `/api/organizations/${org!.id}/transition`,
      { newType: target, excludedMemberIds: Array.from(excluded) },
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization", "mine"] });
      queryClient.invalidateQueries({ queryKey: ["organization", "members", org?.id] });
      toast({ title: "Organization type updated" });
      onOpenChange(false);
    },
    onError: (e) => toast({ title: "Could not transition", description: String(e) }),
  });

  if (!org) return null;
  const members = data?.members ?? [];
  const excludedCount = Array.from(excluded).filter((id) => id !== myUserId).length;

  return (
    <div
      className={"fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 " + (open ? "" : "hidden")}
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-md rounded-lg border border-outline bg-background p-5 shadow-xl max-h-[80vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold">
          Move to {target === "enterprise" ? "Enterprise" : "Team"}
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          <span className="capitalize">{org.orgType}</span> → <span className="capitalize">{target}</span>.
          Members you uncheck will be removed from the org and return to personal-only.
        </p>

        {isLoading || !data ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading members…</p>
        ) : (
          <div className="mt-4 space-y-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {members.length} member{members.length === 1 ? "" : "s"}
              {excludedCount > 0 ? ` · ${excludedCount} excluded` : ""}
            </p>
            <div className="border border-outline rounded divide-y divide-outline max-h-72 overflow-y-auto">
              {members.map((m) => {
                const isMe = m.userId === myUserId;
                const checked = isMe || excluded.has(m.userId);
                const disabled = isMe;
                return (
                  <label
                    key={m.id}
                    className={
                      "flex items-center gap-2 px-3 py-2 text-sm " +
                      (disabled ? "opacity-70 cursor-default" : "cursor-pointer hover:bg-accent/40")
                    }
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => {
                        if (disabled) return;
                        setExcluded((prev) => {
                          const next = new Set(prev);
                          if (next.has(m.userId)) next.delete(m.userId);
                          else next.add(m.userId);
                          return next;
                        });
                      }}
                    />
                    <span className="flex-1 min-w-0 truncate">
                      {m.user.displayName}
                      {isMe && <span className="ml-2 text-[10px] uppercase text-muted-foreground">you (admin)</span>}
                    </span>
                    <span className="text-[10px] uppercase text-muted-foreground">{m.role}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-9 px-4 rounded-md border border-outline text-sm hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(
                excludedCount > 0
                  ? `Move to ${target} and remove ${excludedCount} member(s)?`
                  : `Move to ${target}?`,
              )) {
                transition.mutate();
              }
            }}
            disabled={transition.isPending}
            className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {transition.isPending ? "Updating…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
