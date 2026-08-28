
import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RoleDemotionSection } from "@/components/settings/role-demotion";
import { StartOrgModal } from "@/components/organizations/start-org-modal";
import { InviteModal } from "@/components/organizations/invite-modal";
import { DataPicker } from "@/components/organizations/data-picker";
import { TransitionModal } from "@/components/organizations/transition-modal";
import { PendingInvitations } from "@/components/organizations/pending-invitations";
import { OrgMembers } from "@/components/organizations/org-members";
import { useMyOrg, useWorkspaceSetter } from "@/hooks/use-workspace";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null);
  const [aiProvider, setAiProvider] = useState("");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [startOrgType, setStartOrgType] = useState<"team" | "enterprise" | null>(null);
  const queryClient = useQueryClient();
  const { data: myOrg } = useMyOrg();
  const { toast } = useToast();
  const setActive = useWorkspaceSetter();
  const [showInvite, setShowInvite] = useState(false);
  const [transferMode, setTransferMode] = useState<"to_org" | "from_org" | null>(null);
  const [showTransition, setShowTransition] = useState(false);
  const leaveMutation = useMutation({
    mutationFn: () => api.post("/api/organizations/leave", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization", "mine"] });
      setActive({ type: "personal" });
      toast({ title: "You left the organization" });
    },
    onError: (e) => toast({ title: "Could not leave", description: String(e) }),
  });
  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/api/organizations/${myOrg?.organization?.id ?? ""}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization", "mine"] });
      setActive({ type: "personal" });
      toast({ title: "Organization deleted" });
    },
    onError: (e) => toast({ title: "Could not delete", description: String(e) }),
  });

  useEffect(() => {
    fetch("/api/auth/session", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        const u = data.data || data.user;
        if (u) {
          setUser(u);
          setDisplayName(u.displayName || "");
        }
      })
      .catch(() => {});

    fetch("/api/assistant/settings", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.provider) setAiProvider(data.provider);
        if (data.model) setAiModel(data.model);
        setApiKeyConfigured(Boolean(data.apiKeyConfigured));
      })
      .catch(() => {});

  }, []);

  const saveProfile = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {credentials: "include", 
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName }),
      });
      if (res.ok) setMessage({ text: "Profile saved!", type: "success" });
      else setMessage({ text: "Failed to save profile.", type: "error" });
    } catch {
      setMessage({ text: "Error saving profile.", type: "error" });
    }
    setSaving(false);
  };

  const saveAiSettings = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/assistant/settings", {credentials: "include", 
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: aiProvider || undefined,
          apiKey: aiApiKey || undefined,
          model: aiModel || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setApiKeyConfigured(Boolean(data.apiKeyConfigured));
        setAiApiKey("");
        setMessage({ text: "AI settings saved!", type: "success" });
      } else {
        const data = await res.json().catch(() => ({}));
        setMessage({ text: data?.error?.message || "Failed to save AI settings.", type: "error" });
      }
    } catch {
      setMessage({ text: "Error saving AI settings.", type: "error" });
    }
    setSaving(false);
  };


  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account and preferences</p>
      </div>

      {message && (
        <div
          className={`px-4 py-2 border-2 text-sm ${
            message.type === "success"
              ? "bg-primary/10 border-primary/30 text-foreground"
              : "bg-destructive/10 border-destructive/30 text-destructive-foreground"
          }`}
        >
          {message.text}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Organization</CardTitle>
          <CardDescription>
            {myOrg?.organization
              ? "Manage members, transfer data, or leave."
              : "Start a team or enterprise to share boards, notes, and tickets with others."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {myOrg?.organization ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{myOrg.organization.orgName}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {myOrg.organization.orgType === "enterprise" ? "Enterprise" : "Team"} · your role: {myOrg.organization.role}
                  </p>
                </div>
                {myOrg.organization.role === "admin" && (
                  <Button size="sm" onClick={() => setShowInvite(true)}>
                    Invite member
                  </Button>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setTransferMode("to_org")}
                >
                  Bring data to org
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setTransferMode("from_org")}
                >
                  Pull data to personal
                </Button>
                {myOrg.organization.role === "admin" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowTransition(true)}
                  >
                    Move to {myOrg.organization.orgType === "team" ? "Enterprise" : "Team"}
                  </Button>
                )}
              </div>

              <PendingInvitations />

              <div className="pt-2">
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Members</h3>
                <OrgMembers
                  orgId={myOrg.organization.id}
                  isOwner={myOrg.organization.role === "admin" && user?.id !== undefined}
                  myUserId={user?.id ?? ""}
                  onLeave={() => leaveMutation.mutate()}
                  onDelete={() => deleteMutation.mutate()}
                />
              </div>

              {showInvite && (
                <InviteModal
                  orgId={myOrg.organization.id}
                  open={showInvite}
                  onOpenChange={setShowInvite}
                />
              )}

              {transferMode && (
                <DataPicker
                  direction={transferMode}
                  orgId={myOrg.organization.id}
                  open={Boolean(transferMode)}
                  onOpenChange={(o) => { if (!o) setTransferMode(null); }}
                  onComplete={() => {}}
                />
              )}

              {showTransition && (
                <TransitionModal
                  open={showTransition}
                  onOpenChange={setShowTransition}
                  myUserId={user?.id ?? ""}
                />
              )}
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setStartOrgType("team")}>
                Start a Team
              </Button>
              <Button variant="outline" onClick={() => setStartOrgType("enterprise")}>
                Start an Enterprise
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your personal information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium block mb-1">Email</label>
            <Input value={user?.email || ""} disabled className="bg-muted" />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Display Name</label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
            />
          </div>
          <Button onClick={saveProfile} disabled={saving}>
            {saving ? "Saving..." : "Save Profile"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Customize how Mkindayzir looks</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Theme</p>
              <p className="text-xs text-muted-foreground">Switch between light and dark mode</p>
            </div>
            
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI Assistant</CardTitle>
          <CardDescription>Configure your AI provider and API key</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium block mb-1">Provider</label>
            <select
              value={aiProvider}
              onChange={(e) => setAiProvider(e.target.value)}
              className="w-full px-3 py-2 border-2 border-outline bg-surface font-mono text-foreground focus:border-primary focus:outline-none"
            >
              <option value="openrouter">OpenRouter</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="custom">Custom (OpenAI-compatible)</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">API Key</label>
            <Input
              type="password"
              value={aiApiKey}
              onChange={(e) => setAiApiKey(e.target.value)}
              placeholder="Enter your API key (leave empty to keep current)"
            />
            <div className="flex items-center gap-2 mt-1">
              {apiKeyConfigured ? (
                <span className="inline-flex items-center gap-1 text-xs text-primary">
                  API key configured and encrypted
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  No API key configured yet
                </span>
              )}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Default Model</label>
            <Input
              value={aiModel}
              onChange={(e) => setAiModel(e.target.value)}
              placeholder={
                aiProvider === "openrouter"
                  ? "e.g., anthropic/claude-sonnet-4-20250514"
                  : aiProvider === "openai"
                  ? "e.g., gpt-4o-mini"
                  : "e.g., claude-3-haiku-20240307"
              }
            />
          </div>
          <Button onClick={saveAiSettings} disabled={saving}>
            {saving ? "Saving..." : "Save AI Settings"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
          <CardDescription>Password and session management</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            To change your password, use the forgot password flow from the login page.
          </p>
        </CardContent>
      </Card>

      {myOrg?.organization?.role === "admin" && (
        <Card className="border-2 border-destructive/30">
          <CardHeader>
            <CardTitle>Account Role</CardTitle>
            <CardDescription>
              Change your system role (irreversible without another active admin)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RoleDemotionSection currentRole={user.role} />
          </CardContent>
        </Card>
      )}

      {startOrgType && (
        <StartOrgModal
          open={Boolean(startOrgType)}
          onOpenChange={(open) => { if (!open) setStartOrgType(null); }}
          defaultType={startOrgType}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ["organization", "mine"] });
          }}
        />
      )}
    </div>
  );
}
