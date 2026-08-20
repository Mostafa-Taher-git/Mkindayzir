import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ProjectsPage() {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-2">Projects</h1>
      <p className="text-muted-foreground mb-6">Manage your projects and work items</p>
      <Card>
        <CardHeader>
          <CardTitle>Projects</CardTitle>
          <CardDescription>No projects yet.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Create your first project to get started.</p>
        </CardContent>
      </Card>
    </div>
  );
}
