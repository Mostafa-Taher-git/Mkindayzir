import { getSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
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
  try {
    return await prisma.project.findUnique({ where: { id: projectId, deletedAt: null } });
  } catch {
    return null;
  }
}

async function getProjectStats(projectId: string) {
  try {
    const [total, open, closed, backlog] = await Promise.all([
      prisma.workItem.count({ where: { projectId, deletedAt: null } }),
      prisma.workItem.count({ where: { projectId, deletedAt: null, resolvedAt: null } }),
      prisma.workItem.count({ where: { projectId, deletedAt: null, resolvedAt: { not: null } } }),
      prisma.workItem.count({ where: { projectId, deletedAt: null, iterationId: null, resolvedAt: null } }),
    ]);
    return { total, open, closed, backlog };
  } catch {
    return { total: 0, open: 0, closed: 0, backlog: 0 };
  }
}

export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const user = await getSessionUser();
  if (!user) redirect(ROUTES.LOGIN);

  const { projectId } = await params;
  const project = await getProject(projectId);
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
          </div>
          <p className="text-muted-foreground mt-1">
            {project.description || "No description"}
          </p>
          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
            <span className="capitalize">{project.status?.toLowerCase() ?? "active"}</span>
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
            <CardHeader><CardTitle>Work Items</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Navigate to the Work Items tab to view all items.</p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="board" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Board</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Navigate to the Board tab for the Kanban view.</p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="backlog" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Backlog</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Navigate to the Backlog tab for unassigned items.</p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="iterations" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Iterations</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Navigate to the Iterations tab.</p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="initiatives" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Initiatives</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Navigate to the Initiatives tab.</p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="settings" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Settings</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Project settings coming soon.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
