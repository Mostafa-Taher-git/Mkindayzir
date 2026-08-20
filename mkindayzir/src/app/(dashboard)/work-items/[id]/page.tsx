"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ROUTES } from "@/lib/constants";
import { WORK_ITEM_TYPES, PRIORITIES, WORK_ITEM_STATUSES } from "@/lib/constants";
import type { WorkItem, WorkItemActivity, WorkItemComment } from "@/types/work-item";
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

const FORM_STATUSES = WORK_ITEM_STATUSES as unknown as Array<{ value: string; label: string }>;

function WorkItemDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [priority, setPriority] = React.useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["work-items", id],
    queryFn: async () => {
      const res = await fetch(`/api/work-items/${id}`);
      if (!res.ok) throw new Error("Failed to fetch work item");
      const json = await res.json();
      return json as { workItem: WorkItem };
    },
  });

  const { data: commentsData } = useQuery({
    queryKey: ["work-items", id, "comments"],
    queryFn: async () => {
      const res = await fetch(`/api/work-items/${id}/comments`);
      if (!res.ok) return { comments: [] };
      const json = await res.json();
      return json as { comments: WorkItemComment[] };
    },
  });

  const { data: activityData } = useQuery({
    queryKey: ["work-items", id, "activities"],
    queryFn: async () => {
      const res = await fetch(`/api/work-items/${id}/activities`);
      if (!res.ok) return { activities: [] };
      const json = await res.json();
      return json as { activities: WorkItemActivity[] };
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { title?: string; description?: string; status?: string; priority?: string }) => {
      const res = await fetch(`/api/work-items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update work item");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work-items", id] });
      setIsEditing(false);
    },
  });

  const transitionMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      const res = await fetch(`/api/work-items/${id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed to transition work item");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work-items", id] });
    },
  });

  React.useEffect(() => {
    if (data?.workItem) {
      setTitle(data.workItem.title);
      setDescription(data.workItem.description ?? "");
      setStatus(data.workItem.status);
      setPriority(data.workItem.priority);
    }
  }, [data]);

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="text-center text-muted-foreground">Loading work item...</div>
      </div>
    );
  }

  if (!data?.workItem) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">Work item not found.</p>
            <Button asChild className="mt-4">
              <Link href={ROUTES.PROJECTS}>Back to Projects</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const item = data.workItem;

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`${ROUTES.PROJECTS}/${item.projectId}/work-items`}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground font-mono">
                {item.project?.key || "PRJ"}-{item.number}
              </span>
              <Badge variant="secondary">{item.type}</Badge>
              <Badge variant="outline">{item.status}</Badge>
            </div>
            {isEditing ? (
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-2xl font-bold mt-1 w-full border rounded px-2 py-1"
              />
            ) : (
              <h1 className="text-2xl font-bold">{item.title}</h1>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <Button variant="ghost" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
              <Button
                onClick={() =>
                  updateMutation.mutate({
                    title,
                    description,
                    status,
                    priority,
                  })
                }
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={() => setIsEditing(true)}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 mr-1"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
              Edit
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={6}
                />
              ) : (
                <p className="text-sm whitespace-pre-wrap">
                  {item.description || "No description provided."}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Comments</CardTitle>
            </CardHeader>
            <CardContent>
              {commentsData?.comments?.length ? (
                <div className="space-y-4">
                  {commentsData.comments.map((comment: WorkItemComment) => (
                    <div key={comment.id} className="flex gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={comment.author?.avatar ?? ""} alt={comment.author?.displayName} />
                        <AvatarFallback>{getInitials(comment.author)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{comment.author?.displayName}</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(comment.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-sm mt-1">{comment.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No comments yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {activityData?.activities?.length ? (
                <div className="space-y-3">
                  {activityData.activities.map((activity: WorkItemActivity) => (
                    <div key={activity.id} className="flex items-start gap-2 text-sm">
                      <span className="font-medium">{activity.user?.displayName}</span>
                      <span className="text-muted-foreground">{activity.action}</span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {new Date(activity.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No activity yet.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent>
              <Select
                options={FORM_STATUSES}
                value={item.status}
                onChange={(e) => transitionMutation.mutate(e.target.value)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Priority</span>
                <Badge variant="secondary">{item.priority}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Assignee</span>
                <span>{item.assignee?.displayName || "Unassigned"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reporter</span>
                <span>{item.reporter?.displayName || "Unknown"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Due Date</span>
                <span>{item.dueDate ? new Date(item.dueDate).toLocaleDateString() : "None"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Story Points</span>
                <span>{item.storyPoints ?? "-"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Iteration</span>
                <span>{item.iteration?.name || "None"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Initiative</span>
                <span>{item.initiative?.name || "None"}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default WorkItemDetailPage;
