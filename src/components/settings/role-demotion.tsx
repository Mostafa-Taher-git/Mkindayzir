import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, ShieldAlert } from "lucide-react";

interface RoleDemotionSectionProps {
  currentRole: string;
}

export function RoleDemotionSection({ currentRole }: RoleDemotionSectionProps) {
  const [selectedRole, setSelectedRole] = useState<string>("MEMBER");
  const [showWarning1, setShowWarning1] = useState(false);
  const [showWarning2, setShowWarning2] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startDemotionFlow = () => {
    setError(null);
    if (selectedRole === currentRole) return;
    setShowWarning1(true);
  };

  const handleConfirmWarning1 = () => {
    setShowWarning1(false);
    setConfirmInput("");
    setShowWarning2(true);
  };

  const handleFinalDemotion = async () => {
    if (confirmInput.trim() !== "DEMOTE") {
      setError("Please type 'DEMOTE' exactly to confirm.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/role", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          newRole: selectedRole,
          confirmation: confirmInput.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message || data?.message || "Failed to update role");
      }

      setShowWarning2(false);
      window.location.reload();
    } catch (err: any) {
      setError(err.message || "An error occurred during role change");
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-destructive/10 border-2 border-destructive/30 text-destructive text-sm font-medium">
          {error}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
        <div className="flex-1 w-full space-y-1.5">
          <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            Select New Role
          </label>
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            className="w-full px-3 py-2 border-2 border-outline bg-surface font-mono text-foreground focus:border-primary focus:outline-none"
          >
            <option value="MANAGER">MANAGER — Team &amp; Project Oversight</option>
            <option value="AGENT">AGENT — Helpdesk &amp; Tickets</option>
            <option value="MEMBER">MEMBER — Standard Contributor</option>
            <option value="VIEWER">VIEWER — Read-only Observer</option>
          </select>
        </div>

        <Button
          variant="destructive"
          onClick={startDemotionFlow}
          disabled={selectedRole === currentRole}
        >
          Change Role
        </Button>
      </div>

      {/* Warning 1 Modal */}
      <Dialog open={showWarning1} onOpenChange={setShowWarning1}>
        <DialogContent className="sm:max-w-md border-2 border-destructive/40">
          <DialogHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <DialogTitle className="text-destructive">WARNING: Role Demotion</DialogTitle>
            </div>
            <DialogDescription className="pt-2 text-foreground font-normal">
              You are about to change your role from <strong>{currentRole}</strong> to{" "}
              <strong>{selectedRole}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-sm">
            <p className="font-semibold text-destructive">
              This means you will LOSE access to:
            </p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground pl-2 font-mono text-xs">
              <li>User and team management (manage:users, manage:teams)</li>
              <li>System settings and environment config (manage:settings)</li>
              <li>Administrative ticket assignment and deletion</li>
              <li>Database migration and system management tools</li>
            </ul>
            <p className="text-xs text-muted-foreground pt-1 bg-muted p-2.5 border">
              Only another <strong>ADMIN</strong> will be able to restore your admin privileges.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowWarning1(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmWarning1}>
              I Understand, Continue →
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Warning 2 Modal */}
      <Dialog open={showWarning2} onOpenChange={setShowWarning2}>
        <DialogContent className="sm:max-w-md border-2 border-destructive">
          <DialogHeader>
            <div className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-6 w-6 animate-pulse" />
              <DialogTitle className="text-destructive">
                FINAL WARNING: Permanent & Irreversible
              </DialogTitle>
            </div>
            <DialogDescription className="pt-2 text-foreground">
              If no other active ADMIN exists in the system, you will be permanently locked out of
              administrative functions.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-sm">
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded text-xs text-destructive">
              You will NOT be able to create users, change system settings, access admin panels, or
              adjust deployment settings.
            </div>

            <div className="space-y-2">
              <label className="text-xs font-mono font-medium block">
                Type <strong className="text-destructive font-bold">DEMOTE</strong> to confirm:
              </label>
              <Input
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder="Type DEMOTE"
                className="font-mono"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowWarning2(false)} disabled={loading}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleFinalDemotion}
              disabled={confirmInput.trim() !== "DEMOTE" || loading}
            >
              {loading ? "Demoting..." : "Confirm Demotion"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
