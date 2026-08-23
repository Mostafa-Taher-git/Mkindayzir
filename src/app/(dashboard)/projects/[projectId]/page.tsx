"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProjectActions } from "@/components/projects/project-actions";
import { ROUTES } from "@/lib/constants";

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery<{ project: any; stats: any }>({
    queryKey: ["project", projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch project");
      return res.json();
    },
  });

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading project...</div>;
  }

  const project = data?.project;

  if (!project) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">Project not found.</p>
            <Button asChild className="mt-4">
              <Link to={ROUTES.PROJECTS}>Back to Projects</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{project.name}</h1>
            <Badge variant="secondary">{project.key}</Badge>
          </div>
          <p className="text-muted-foreground mt-1">{project.description || "No description"}</p>
          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
            <span className="capitalize">{project.status?.toLowerCase() ?? "active"}</span>
          </div>
        </div>
        <ProjectActions
          projectId={project.id}
          initialName={project.name}
          initialDescription={project.description ?? ""}
        />
      </div>
      <Button variant="outline" onClick={() => navigate(ROUTES.PROJECTS)}>
        Back to Projects
      </Button>
    </div>
  );
}
