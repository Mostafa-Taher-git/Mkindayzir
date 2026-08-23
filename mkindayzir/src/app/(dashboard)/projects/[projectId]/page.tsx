import { getSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProjectActions } from "@/components/projects/project-actions";
import { ROUTES } from "@/lib/constants";
import Link from "next/link";

interface ProjectDetailPageProps {
  params: Promise<{ projectId: string }>;
}

async function getProject(projectId: string) {
  try {
    return await prisma.project.findUnique({ where: { id: projectId, deletedAt: null } });
  } catch {
    return null;
  }
}

export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const user = await getSessionUser();
  if (!user) redirect(ROUTES.LOGIN);

  const { projectId } = await params;
  const project = await getProject(projectId);

  if (!project) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">Project not found.</p>
            <Button asChild className="mt-4">
              <Link href={ROUTES.PROJECTS}>Back to Projects</Link>
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
          <p className="text-muted-foreground mt-1">
            {project.description || "No description"}
          </p>
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
    </div>
  );
}
