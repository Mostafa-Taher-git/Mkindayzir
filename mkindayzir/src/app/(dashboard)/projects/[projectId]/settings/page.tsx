import { getSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ROUTES } from "@/lib/constants";
import Link from "next/link";

interface ProjectSettingsPageProps {
  params: Promise<{ projectId: string }>;
}

async function getProject(projectId: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/projects/${projectId}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

export default async function ProjectSettingsPage({ params }: ProjectSettingsPageProps) {
  const user = await getSessionUser();
  if (!user) {
    redirect(ROUTES.LOGIN);
  }

  const { projectId } = await params;
  const { project } = await getProject(projectId);

  if (!project) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">Project not found.</p>
            <Link href={ROUTES.PROJECTS} className="text-primary hover:underline mt-4 inline-block">
              Back to Projects
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage project settings for {project.name}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>General Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Project settings coming soon.</p>
        </CardContent>
      </Card>
    </div>
  );
}
