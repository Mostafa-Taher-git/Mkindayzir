
import * as React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProviderType } from "@/types";
import { api } from "@/lib/api";

const providers: { value: ProviderType; label: string }[] = [
  { value: "openrouter", label: "OpenRouter" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "custom", label: "Custom" },
];

interface Settings {
  provider: ProviderType;
  model: string;
  apiKeyConfigured: boolean;
}

function SettingsPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery<Settings>({
    queryKey: ["assistant", "settings"],
    queryFn: async () => {
      const res = await api.get<Settings>("/api/assistant/settings");
      if (!res.ok) throw new Error("Failed to fetch settings");
      return (await res.json()) as Settings;
    },
    enabled: open,
  });

  const [provider, setProvider] = useState<ProviderType>(settings?.provider ?? "openrouter");
  const [model, setModel] = useState(settings?.model ?? "");
  const [apiKey, setApiKey] = useState("");
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [isTesting, setIsTesting] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        provider,
        model,
      };
      if (apiKey) body.apiKey = apiKey;
      if (provider === "custom" && customBaseUrl) {
        body.customBaseUrl = customBaseUrl;
      }
      const res = await api.patch("/api/assistant/settings", body);
      if (!res.ok) throw new Error("Failed to save settings");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assistant", "settings"] });
      toast({
        title: "Settings saved",
        description: "Your AI settings have been updated.",
      });
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save settings.",
      });
    },
  });

  const testConnection = async () => {
    setIsTesting(true);
    try {
      const body: Record<string, unknown> = { provider, model };
      if (apiKey) body.apiKey = apiKey;
      if (provider === "custom" && customBaseUrl) body.customBaseUrl = customBaseUrl;
      const res = await api.patch("/api/assistant/settings", body);
      if (!res.ok) throw new Error("Connection test failed");
      toast({
        title: "Connection successful",
        description: "The API connection is working.",
      });
    } catch {
      toast({
        title: "Connection failed",
        description: "Could not connect to the AI provider.",
      });
    } finally {
      setIsTesting(false);
    }
  };

  React.useEffect(() => {
    if (settings) {
      setProvider(settings.provider);
      setModel(settings.model);
    }
  }, [settings]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="bg-background w-full max-w-md rounded-lg border p-6 shadow-lg">
        <h2 className="text-lg font-semibold">AI Assistant Settings</h2>
        <p className="text-muted-foreground text-sm">
          Configure your AI provider and model.
        </p>
        {isLoading ? (
          <p className="text-muted-foreground py-4 text-sm">Loading...</p>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select
                value={provider}
                onChange={(e) => setProvider(e.target.value as ProviderType)}
                options={providers}
              />
            </div>
            <div className="space-y-2">
              <Label>Model</Label>
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="e.g. gpt-4o-mini"
              />
            </div>
            {provider === "custom" && (
              <div className="space-y-2">
                <Label>Custom Base URL</Label>
                <Input
                  value={customBaseUrl}
                  onChange={(e) => setCustomBaseUrl(e.target.value)}
                  placeholder="https://api.example.com/v1"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>API Key {settings?.apiKeyConfigured && "(configured)"}</Label>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={settings?.apiKeyConfigured ? "Leave blank to keep existing" : "Enter API key"}
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={testConnection}
                disabled={isTesting}
                className="flex-1"
              >
                {isTesting ? "Testing..." : "Test Connection"}
              </Button>
              <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="flex-1">
                {mutation.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          className="mt-4 w-full"
          onClick={() => onOpenChange(false)}
        >
          Close
        </Button>
      </div>
    </div>
  );
}

export { SettingsPanel };
