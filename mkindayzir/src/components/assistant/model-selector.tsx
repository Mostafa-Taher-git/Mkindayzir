"use client";

import * as React from "react";
import { Select } from "@/components/ui/select";
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
  const { data, isLoading } = useQuery({
    queryKey: ["assistant", "models"],
    queryFn: async () => {
      const res = await fetch("/api/assistant/models");
      if (!res.ok) throw new Error("Failed to fetch models");
      return res.json() as Promise<{ models: string[] }>;
    },
  });

  const options = React.useMemo(() => {
    if (!data?.models) return [];
    return data.models.map((model) => ({ value: model, label: model }));
  }, [data]);

  return (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      options={options}
      placeholder={isLoading ? "Loading models..." : "Select model"}
      disabled={disabled || isLoading}
    />
  );
}

export { ModelSelector };
