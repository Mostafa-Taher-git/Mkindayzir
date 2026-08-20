import { usePresence } from "@/hooks/use-presence";
import { PresenceIndicator } from "@/components/shared/presence-indicator";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ROUTES } from "@/lib/constants";
import Link from "next/link";

interface ProjectDetailPageProps {
  params: Promise<{ projectId: string }>;
}

async function getProject(projectId: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/projects/${projectId}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

async function getProjectStats(projectId: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/projects/${projectId}/stats`, {
    cache: "no-store",
  });
  if (!res.ok) return { total: 0, open: 0, closed: 0, backlog: 0 };
  return res.json();
}

function ProjectPresence({ projectId, currentUserId }: { projectId: string; currentUserId: string }) {
  "use client";
  const { presentUsers } = usePresence("project", projectId);
  return <PresenceIndicator users={presentUsers} currentUserId={currentUserId} />;
}

export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const session = await auth();
  if (!session) {
    redirect(ROUTES.LOGIN);
  }

  const { projectId } = await params;
  const { project } = await getProject(projectId);
  const stats = await getProjectStats(projectId);

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

  const tabs = [
    { value: "work-items", label: "Work Items", href: `${ROUTES.PROJECTS}/${projectId}/work-items` },
    { value: "board", label: "Board", href: `${ROUTES.PROJECTS}/${projectId}/board` },
    { value: "backlog", label: "Backlog", href: `${ROUTES.PROJECTS}/${projectId}/backlog` },
    { value: "iterations", label: "Iterations", href: `${ROUTES.PROJECTS}/${projectId}/iterations` },
    { value: "initiatives", label: "Initiatives", href: `${ROUTES.PROJECTS}/${projectId}/initiatives` },
    { value: "settings", label: "Settings", href: `${ROUTES.PROJECTS}/${projectId}/settings` },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{project.name}</h1>
            <Badge variant="secondary">{project.key}</Badge>
            <ProjectPresence projectId={projectId} currentUserId={session.user.id} />
          </div>
          <p className="text-muted-foreground mt-1">
            {project.description || "No description"}
          </p>
          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
            <span className="capitalize">{project.status.toLowerCase()}</span>
            <span>•</span>
            <span className="capitalize">{project.visibility.toLowerCase()}</span>
            <span>•</span>
            <span>{stats.total} items</span>
            <span>•</span>
            <span>{stats.open} open</span>
            <span>•</span>
            <span>{stats.closed} closed</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={`${ROUTES.PROJECTS}/${projectId}/work-items/new`}>
              New Work Item
            </Link>
          </Button>
        </div>
      </div>

      <Tabs defaultValue="work-items">
        <TabsList>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} asChild>
              <Link href={tab.href}>{tab.label}</Link>
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="work-items" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Work Items</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Navigate to the Work Items tab to view all items.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="board" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Board</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Navigate to the Board tab for the Kanban view.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="backlog" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Backlog</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Navigate to the Backlog tab for unassigned items.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="iterations" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Iterations</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Navigate to the Iterations tab.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="initiatives" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Initiatives</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Navigate to the Initiatives tab.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="settings" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Project settings coming soon.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
