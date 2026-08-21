import { getSessionUser } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import Link from "next/link";
import prisma from "@/lib/prisma";

async function getDashboardStats(userId: string) {
  try {
    const [projectCount, openItems, assignedToMe, overdueCount] = await Promise.all([
      prisma.project.count({ where: { deletedAt: null } }),
      prisma.workItem.count({ where: { deletedAt: null, resolvedAt: null } }),
      prisma.workItem.count({ where: { assigneeId: userId, deletedAt: null, resolvedAt: null } }),
      prisma.workItem.count({
        where: {
          deletedAt: null,
          resolvedAt: null,
          dueDate: { lt: new Date() },
        },
      }),
    ]);
    return { projectCount, openItems, assignedToMe, overdueCount };
  } catch {
    return { projectCount: 0, openItems: 0, assignedToMe: 0, overdueCount: 0 };
  }
}

async function getRecentActivity() {
  try {
    const activities = await prisma.activity.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { user: { select: { displayName: true } } },
    });
    return activities;
  } catch {
    return [];
  }
}

export default async function DashboardPage() {
  const user = await getSessionUser();
  const stats = await getDashboardStats(user?.id ?? "");
  const activities = await getRecentActivity();

  const statCards = [
    { title: "Projects", value: String(stats.projectCount), description: "Active projects", critical: false },
    { title: "Open Work Items", value: String(stats.openItems), description: "Pending tasks", critical: false },
    { title: "Assigned to Me", value: String(stats.assignedToMe), description: "Your tasks", critical: false },
    { title: "Overdue", value: String(stats.overdueCount), description: "Needs attention", critical: stats.overdueCount > 0 },
  ];

  const quickActions = [
    { label: "Projects", href: ROUTES.PROJECTS, description: "Manage your projects and work items" },
    { label: "Boards", href: ROUTES.BOARDS, description: "Visual task boards" },
    { label: "Vault", href: ROUTES.VAULT, description: "Team knowledge base" },
    { label: "Assistant", href: ROUTES.ASSISTANT, description: "AI-powered assistant" },
  ];

  return (
    <div className="p-6 space-y-6 animate-power-on">
      <div>
        <h1 className="text-3xl font-bold">
          Welcome back, {user?.displayName?.split(" ")[0] ?? "User"}
        </h1>
        <p className="text-muted-foreground mt-1">
          Here&apos;s what&apos;s happening across your workspace.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={cn("text-3xl font-bold", stat.critical && "text-destructive")}>
                {stat.value}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
              {stat.critical && (
                <Badge variant="active" className="mt-2">ACTION REQUIRED</Badge>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest updates from your workspace</CardDescription>
          </CardHeader>
          <CardContent>
            {activities.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent activity yet. Start by creating a project!</p>
            ) : (
              <div className="space-y-3">
                {activities.map((activity: any) => (
                  <div key={activity.id} className="flex items-start gap-3 text-sm">
                    <div className="w-2 h-2 mt-1.5 rounded-full bg-primary shrink-0" />
                    <div>
                      <span className="font-medium">{activity.user?.displayName}</span>{" "}
                      <span className="text-muted-foreground">{activity.action}</span>{" "}
                      <span className="text-muted-foreground">
                        {activity.entityType} 
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Jump into your work</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {quickActions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="flex items-center justify-between border-2 border-outline p-3 hover:border-primary transition-colors"
              >
                <div>
                  <p className="text-sm font-medium">{action.label}</p>
                  <p className="text-xs text-muted-foreground">{action.description}</p>
                </div>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-muted-foreground"
                >
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
