
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/constants";
import { Link } from "react-router-dom";

export default function ProjectsPage() {
  const { data, isLoading } = useQuery<{ projects: any[] }>({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch projects");
      return res.json();
    },
  });

  const projects = data?.projects ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Projects</h1>
          <p className="text-muted-foreground mt-1">Manage your projects and work items</p>
        </div>
        <Button asChild>
          <Link to={`${ROUTES.PROJECTS}/new`}>New Project</Link>
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading projects...</p>
      ) : projects.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Projects</CardTitle>
            <CardDescription>No projects yet.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Create your first project to get started.</p>
            <Button asChild className="mt-4">
              <Link to={`${ROUTES.PROJECTS}/new`}>Create Project</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project: any) => (
            <Link key={project.id} to={`${ROUTES.PROJECTS}/${project.id}`}>
              <Card className="h-full hover:shadow-md transition-shadow cursor-pointer">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{project.name}</CardTitle>
                    <Badge variant="secondary">{project.key}</Badge>
                  </div>
                  <CardDescription className="line-clamp-2">
                    {project.description || "No description"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground capitalize">
                      {project.status?.toLowerCase() ?? "active"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
