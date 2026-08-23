
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import { Link } from "react-router-dom";

interface DashboardStats {
  projectCount: number;
  workItemCount: number;
  recentActivities: Array<{
    id: string;
    action: string;
    entityType?: string;
    entityId?: string;
    createdAt?: string;
    user?: { displayName?: string } | null;
  }>;
}

export default function DashboardPage() {
  const { data, isLoading } = useQuery<DashboardStats>({
    queryKey: ["dashboard", "stats"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard/stats", { credentials: "include" });
      if (res.status === 401) {
        window.location.href = "/login";
        return { projectCount: 0, workItemCount: 0, recentActivities: [] };
      }
      if (!res.ok) {
        return { projectCount: 0, workItemCount: 0, recentActivities: [] };
      }
      return res.json();
    },
  });

  const stats = data ?? { projectCount: 0, workItemCount: 0, recentActivities: [] };

  const statCards = [
    { title: "Projects", value: String(stats.projectCount), description: "Active projects", critical: false },
    { title: "Work Items", value: String(stats.workItemCount), description: "Open tasks", critical: false },
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
        <h1 className="text-3xl font-bold">Welcome back</h1>
        <p className="text-muted-foreground mt-1">
          Here&apos;s what&apos;s happening across your workspace.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading workspace...</p>
      ) : (
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
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest updates from your workspace</CardDescription>
          </CardHeader>
          <CardContent>
            {!stats.recentActivities || stats.recentActivities.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent activity yet. Start by creating a project!</p>
            ) : (
              <div className="space-y-3">
                {stats.recentActivities.map((activity: any) => (
                  <div key={activity.id} className="flex items-start gap-3 text-sm">
                    <div className="w-2 h-2 mt-1.5 rounded-full bg-primary shrink-0" />
                    <div>
                      <span className="font-medium">{activity.user?.displayName}</span>{" "}
                      <span className="text-muted-foreground">{activity.action}</span>{" "}
                      <span className="text-muted-foreground">{activity.entityType}</span>
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
                to={action.href}
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
