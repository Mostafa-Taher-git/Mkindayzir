"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { WorkItemTable } from "@/components/work-items/work-item-table";
import { WorkItemFilters } from "@/components/work-items/work-item-filters";
import { BulkActionsBar } from "@/components/shared/bulk-actions-bar";
import { ROUTES } from "@/lib/constants";
import { WORK_ITEM_STATUSES, WORK_ITEM_TYPES, PRIORITIES } from "@/lib/constants";
import type { WorkItem } from "@/types/work-item";
import type { User } from "@/types/user";
import type { Iteration } from "@/types/iteration";

interface WorkItemsPageProps {
  params: Promise<{ projectId: string }>;
}

const statuses = WORK_ITEM_STATUSES as unknown as Array<{ value: string; label: string }>;
const types = WORK_ITEM_TYPES as unknown as Array<{ value: string; label: string }>;
const priorities = PRIORITIES as unknown as Array<{ value: string; label: string }>;

function WorkItemsPage({ params }: WorkItemsPageProps) {
  const router = useRouter();
  const [projectId, setProjectId] = React.useState<string>("");
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [type, setType] = React.useState("all");
  const [priority, setPriority] = React.useState("all");
  const [assignee, setAssignee] = React.useState("all");
  const [iteration, setIteration] = React.useState("all");
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    params.then((p) => setProjectId(p.projectId));
  }, [params]);

  const { data, isLoading } = useQuery({
    queryKey: ["projects", projectId, "work-items", { search, status, type, priority, assignee, iteration }],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (search) qs.set("search", search);
      if (status !== "all") qs.set("status", status);
      if (type !== "all") qs.set("type", type);
      if (priority !== "all") qs.set("priority", priority);
      if (assignee !== "all") qs.set("assigneeId", assignee);
      if (iteration !== "all") qs.set("iterationId", iteration);
      const res = await fetch(`/api/work-items?${qs.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch work items");
      const json = await res.json();
      return json as { workItems: WorkItem[] };
    },
    enabled: Boolean(projectId),
  });

  const { data: usersData } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) return { users: [] };
      const json = await res.json();
      return json as { users: User[] };
    },
  });

  const { data: iterationsData } = useQuery({
    queryKey: ["projects", projectId, "iterations"],
    queryFn: async () => {
      const res = await fetch(`/api/iterations?projectId=${projectId}`);
      if (!res.ok) return { iterations: [] };
      const json = await res.json();
      return json as { iterations: Iteration[] };
    },
    enabled: Boolean(projectId),
  });

  const items = data?.workItems ?? [];

  const handleSelectChange = (id: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleSelectAll = (selected: boolean) => {
    if (selected) setSelectedIds(new Set(items.map((i) => i.id)));
    else setSelectedIds(new Set());
  };

  const handleRowClick = (id: string) => {
    router.push(`/dashboard/work-items/${id}`);
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Work Items</h1>
        <Button asChild>
          <Link href={`${ROUTES.PROJECTS}/${projectId}/work-items/new`}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 mr-1"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
            New Work Item
          </Link>
        </Button>
      </div>

      <WorkItemFilters
        search={search}
        onSearchChange={setSearch}
        status={status}
        onStatusChange={setStatus}
        type={type}
        onTypeChange={setType}
        priority={priority}
        onPriorityChange={setPriority}
        assignee={assignee}
        onAssigneeChange={setAssignee}
        iteration={iteration}
        onIterationChange={setIteration}
        statuses={statuses}
        types={types}
        priorities={priorities}
        assignees={usersData?.users ?? []}
        iterations={iterationsData?.iterations ?? []}
      />

      <BulkActionsBar
        selectedCount={selectedIds.size}
        onAssign={() => {}}
        onChangeStatus={() => {}}
        onAddLabel={() => {}}
        onDelete={() => {}}
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : (
            <WorkItemTable
              items={items}
              selectedIds={selectedIds}
              onSelectChange={handleSelectChange}
              onSelectAll={handleSelectAll}
              onRowClick={handleRowClick}
              projectKey="PRJ"
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default WorkItemsPage;
