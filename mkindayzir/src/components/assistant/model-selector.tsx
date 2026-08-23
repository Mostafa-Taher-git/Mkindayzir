"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

function ModelSelector({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [manualMode, setManualMode] = React.useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["assistant", "models"],
    queryFn: async () => {
      const res = await fetch("/api/assistant/models");
      if (!res.ok) throw new Error("Failed to fetch models");
      return res.json() as Promise<{ models: Array<{ id: string; name: string }> }>;
    },
    retry: false,
    staleTime: 5 * 60 * 1000, // cache for 5 minutes
  });

  const models = React.useMemo(() => {
    if (!data?.models) return [];
    return data.models;
  }, [data]);

  // If we can't fetch models (no API key, etc), show manual input
  if (isError || manualMode) {
    return (
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type model ID (e.g., anthropic/claude-sonnet-4-20250514)"
          disabled={disabled}
          className="flex-1 h-8 px-2 border border-outline bg-surface text-xs font-mono text-foreground focus:border-primary focus:outline-none rounded-sm"
        />
        {isError && models.length === 0 && (
          <button
            type="button"
            onClick={() => setManualMode(false)}
            className="text-[10px] text-muted-foreground underline hover:text-foreground whitespace-nowrap"
          >
            retry list
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || isLoading}
        className="flex-1 h-8 px-2 border border-outline bg-surface text-xs font-mono text-foreground focus:border-primary focus:outline-none rounded-sm"
      >
        <option value="">
          {isLoading ? "Loading models..." : "Select a model"}
        </option>
        {models.map((model) => (
          <option key={model.id} value={model.id}>
            {model.name || model.id}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setManualMode(true)}
        className="text-[10px] text-muted-foreground underline hover:text-foreground whitespace-nowrap"
        title="Type model ID manually"
      >
        manual
      </button>
    </div>
  );
}

export { ModelSelector };
