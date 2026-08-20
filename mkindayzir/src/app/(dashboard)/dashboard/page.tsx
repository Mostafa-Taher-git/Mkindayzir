import { auth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await auth();

  const stats = [
    { title: "Projects", value: "12", description: "Active projects", critical: false },
    { title: "Open Work Items", value: "47", description: "Pending tasks", critical: false },
    { title: "Assigned to Me", value: "8", description: "Your tasks", critical: false },
    { title: "Overdue", value: "3", description: "Needs attention", critical: true },
  ];

  const quickActions = [
    { label: "Projects", href: ROUTES.PROJECTS, description: "Manage your projects and work items" },
    { label: "Boards", href: ROUTES.BOARDS, description: "Visual task boards" },
    { label: "Vault", href: ROUTES.VAULT, description: "Team knowledge base" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-display uppercase tracking-wider">
          Welcome back, {session?.user?.displayName?.split(" ")[0] ?? "User"}
        </h1>
        <p className="text-muted-foreground mt-1 font-mono text-sm uppercase tracking-wider">
          Here&apos;s what&apos;s happening across your workspace today.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground font-mono uppercase tracking-wider">
                {stat.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={cn("text-2xl font-bold font-mono", stat.critical && "text-destructive")}>
                {stat.value}
              </div>
              <p className="text-xs text-muted-foreground mt-1 font-mono uppercase tracking-wider">{stat.description}</p>
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
            <CardTitle className="font-display uppercase tracking-wider">Recent Activity</CardTitle>
            <CardDescription>Latest updates from your workspace</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">No recent activity to display.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display uppercase tracking-wider">Quick Actions</CardTitle>
            <CardDescription>Frequently used shortcuts</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {quickActions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="flex items-center justify-between border-2 border-outline p-3 hover:bg-accent transition-colors"
              >
                <div>
                  <p className="text-sm font-medium">{action.label}</p>
                  <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider">{action.description}</p>
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
