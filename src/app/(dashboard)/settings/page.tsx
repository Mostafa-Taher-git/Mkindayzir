
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { RoleDemotionSection } from "@/components/settings/role-demotion";

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null);
  const [aiProvider, setAiProvider] = useState("");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [mode, setMode] = useState<string>("personal");
  const [dbSize, setDbSize] = useState<number>(0);

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

    fetch("/api/system/migration/status", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        setMode(data.mode);
        setDbSize(data.database_size_mb || 0);
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

  const toggleTheme = () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(next);
    localStorage.setItem("mkindayzir-theme", next);
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
            <Button variant="outline" onClick={toggleTheme}>
              Toggle Theme
            </Button>
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

      {mode !== "personal" && user?.role === "ADMIN" && (
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

      {mode === "personal" && (
        <Card className="border-2 border-accent/30">
          <CardHeader>
            <CardTitle>System</CardTitle>
            <CardDescription>Database and deployment settings</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Current Mode: Personal (SQLite)</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Database: ./data/mkindayzir.db ({dbSize.toFixed(2)} MB)
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => (window.location.href = ROUTES.SETTINGS_SYSTEM)}
              >
                Manage System
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
