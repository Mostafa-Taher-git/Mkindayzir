import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";

const ROLES = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
];

interface InviteModalProps {
  orgId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InviteModal({ orgId, open, onOpenChange }: InviteModalProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("admin");

  const invite = useMutation({
    mutationFn: () => api.post<{ invitation: any }>("/api/invitations", { orgId, email, role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invitations", "org", orgId] });
      setEmail("");
      setRole("admin");
      toast({ title: "Invitation sent", description: `Invite sent to ${email}.` });
      onOpenChange(false);
    },
    onError: (e) => toast({ title: "Could not invite", description: String(e) }),
  });

  return (
    <div
      className={
        "fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 " +
        (open ? "" : "hidden")
      }
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-md rounded-lg border border-outline bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold">Invite member</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Free: up to 5 members · Pro: unlimited · Enterprise: unlimited — Invites expire in 7 days.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-medium block mb-1">Email</label>
            <input
              autoFocus
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && email.trim() && !invite.isPending) invite.mutate(); }}
              placeholder="user@example.com"
              className="w-full h-9 rounded-md border border-input bg-surface px-3 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full h-9 rounded-md border bg-transparent px-3 py-1 text-sm"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <Btn variant="outline" onClick={() => onOpenChange(false)} disabled={invite.isPending}>
            Cancel
          </Btn>
          <Btn onClick={() => invite.mutate()} disabled={!email.trim() || invite.isPending}>
            {invite.isPending ? "Sending…" : "Send invite"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

type Variant = "primary" | "outline" | "destructive";

function Btn(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const { variant, className, ...rest } = props;
  const base = "inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 transition-colors disabled:opacity-50";
  const styles: Record<Variant, string> = {
    primary: "bg-primary text-primary-foreground hover:bg-primary/90",
    outline: "border border-outline bg-background hover:bg-accent",
    destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  };
  return <button {...rest} className={`${base} ${styles[variant ?? "primary"]} ${className ?? ""}`} />;
}
