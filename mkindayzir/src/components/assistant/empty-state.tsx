"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";

const quickActions = [
  {
    title: "Analyze a work item",
    description: "Ask about a specific task or bug",
    prompt: "Can you help me analyze a work item?",
  },
  {
    title: "Draft a note",
    description: "Help me write content for the vault",
    prompt: "Help me draft a note for our knowledge base.",
  },
  {
    title: "Plan a sprint",
    description: "Suggest tasks for the next iteration",
    prompt: "Help me plan our next sprint.",
  },
  {
    title: "Summarize activity",
    description: "Get a quick overview of recent updates",
    prompt: "Give me a summary of recent activity.",
  },
];

function EmptyState({
  onSelectPrompt,
}: {
  onSelectPrompt: (prompt: string) => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-6">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-primary"
        >
          <path d="M12 8V4H8" />
          <rect width="16" height="12" x="4" y="8" rx="2" />
          <path d="M2 14h2" />
          <path d="M20 14h2" />
          <path d="M15 13v2" />
          <path d="M9 13v2" />
        </svg>
      </div>
      <h2 className="mb-1 text-xl font-semibold">How can I help you today?</h2>
      <p className="text-muted-foreground mb-6 text-center text-sm">
        Start a conversation with the AI assistant. Ask questions, draft content, or get insights about your workspace.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {quickActions.map((action) => (
          <Card
            key={action.title}
            className="cursor-pointer transition-colors hover:bg-accent"
            onClick={() => onSelectPrompt(action.prompt)}
          >
            <CardContent className="p-4">
              <p className="text-sm font-medium">{action.title}</p>
              <p className="text-muted-foreground text-xs">{action.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export { EmptyState };
