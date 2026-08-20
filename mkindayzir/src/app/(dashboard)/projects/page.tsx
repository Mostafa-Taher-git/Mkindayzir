import { auth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/constants";
import { PROJECT_STATUSES } from "@/lib/constants";
import Link from "next/link";

async function getProjects() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/projects`, {
    cache: "no-store",
  });
  if (!res.ok) return { projects: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } };
  return res.json();
}

export default async function ProjectsPage() {
  const session = await auth();
  const { projects } = await getProjects();

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Projects</h1>
          <p className="text-muted-foreground mt-1">
            Manage your projects and work items
          </p>
        </div>
        <Button asChild>
          <Link href={`${ROUTES.PROJECTS}/new`}>New Project</Link>
        </Button>
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Projects</CardTitle>
            <CardDescription>No projects yet.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Create your first project to get started.
            </p>
            <Button asChild className="mt-4">
              <Link href={`${ROUTES.PROJECTS}/new`}>Create Project</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project: { id: string; key: string; name: string; description: string | null; status: string; visibility: string }) => (
            <Link key={project.id} href={`${ROUTES.PROJECTS}/${project.id}`}>
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
                      {project.status.toLowerCase()}
                    </span>
                    <span className="text-xs text-muted-foreground capitalize">
                      {project.visibility.toLowerCase()}
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
