import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { useWorkspaceSetter } from "@/hooks/use-workspace";

type OrgType = "team" | "enterprise";

interface StartOrgModalProps {
  defaultType: OrgType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (orgId: string) => void;
}

export function StartOrgModal({ defaultType, open, onOpenChange, onCreated }: StartOrgModalProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const setActive = useWorkspaceSetter();
  const [name, setName] = useState("");
  const [type, setType] = useState<OrgType>(defaultType);

  const start = useMutation({
    mutationFn: async () =>
      api.post<{ organization: { id: string; name: string; type: OrgType; role: string } }>(
        "/api/organizations",
        { name: name.trim(), type },
      ),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["organization", "mine"] });
      setActive({
        type: "org",
        orgId: res.organization.id,
        orgName: res.organization.name,
        orgType: res.organization.type,
        role: res.organization.role,
      });
      toast({ title: "Organization created", description: `You are now an admin of ${res.organization.name}.` });
      setName("");
      onOpenChange(false);
      onCreated?.(res.organization.id);
    },
    onError: (e) => {
      toast({ title: "Could not create", description: String(e) });
    },
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
        <h2 className="text-lg font-bold">
          {type === "team" ? "Start a Team" : "Start an Enterprise"}
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          {type === "team"
            ? "Add up to 5 people to your workspace with shared boards and notes."
            : "Full org with audit logs, custom roles, retention policies and SSO."}
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-medium block mb-1">Organization name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && name.trim() && !start.isPending) start.mutate(); }}
              placeholder="e.g., Acme Corp"
              className="w-full h-9 rounded-md border border-input bg-surface px-3 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as OrgType)}
              className="w-full h-9 rounded-md border bg-transparent px-3 py-1 text-sm"
            >
              <option value="team">Team</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={start.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => start.mutate()}
            disabled={!name.trim() || start.isPending}
          >
            {start.isPending ? "Creating…" : "Create"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "outline" }) {
  const { variant, className, ...rest } = props;
  const base = "inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 transition-colors";
  const styles =
    variant === "outline"
      ? "border border-outline bg-background hover:bg-accent"
      : "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50";
  return <button {...rest} className={`${base} ${styles} ${className ?? ""}`} />;
}
