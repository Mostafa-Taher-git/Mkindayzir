"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ROUTES } from "@/lib/constants";
import { WORK_ITEM_TYPES, PRIORITIES } from "@/lib/constants";
import type { WorkItem } from "@/types/work-item";
import type { User } from "@/types/user";

function getInitials(user?: User) {
  if (!user) return "?";
  return user.displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const TYPE_COLORS: Record<string, string> = {
  TASK: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  BUG: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  FEATURE: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  IMPROVEMENT: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
};

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  HIGH: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  MEDIUM: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  LOW: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
};

function BacklogPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const { data, isLoading } = useQuery({
    queryKey: ["projects", projectId, "backlog"],
    queryFn: async () => {
      const res = await fetch(`/api/work-items?projectId=${projectId}&iterationId=none`);
      if (!res.ok) return { workItems: [] };
      const json = await res.json();
      return json as { workItems: WorkItem[] };
    },
  });

  const items = data?.workItems ?? [];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Backlog</h1>
          <p className="text-muted-foreground mt-1">
            Unassigned work items ready for planning
          </p>
        </div>
        <Button asChild>
          <Link href={`${ROUTES.PROJECTS}/${projectId}/work-items/new`}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 mr-1"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
            New Work Item
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No items in backlog.
            </div>
          ) : (
            <div className="divide-y">
              {items.map((item) => (
                <Link
                  key={item.id}
                  href={`/dashboard/work-items/${item.id}`}
                  className="flex items-center justify-between p-4 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                        TYPE_COLORS[item.type] || TYPE_COLORS.TASK
                      )}
                    >
                      {item.type}
                    </span>
                    <span className="font-medium">{item.title}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.MEDIUM
                      )}
                    >
                      {item.priority}
                    </span>
                    {item.assignee ? (
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={item.assignee.avatar ?? ""} alt={item.assignee.displayName} />
                        <AvatarFallback className="text-xs">
                          {getInitials(item.assignee)}
                        </AvatarFallback>
                      </Avatar>
                    ) : (
                      <span className="text-xs text-muted-foreground">Unassigned</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

export default BacklogPage;
