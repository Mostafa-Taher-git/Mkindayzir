import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ReportsPage() {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-2">Reports</h1>
      <p className="text-muted-foreground mb-6">Analytics and insights</p>
      <Card>
        <CardHeader>
          <CardTitle>Reports</CardTitle>
          <CardDescription>No reports yet.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Generate reports to gain insights into your workspace.</p>
        </CardContent>
      </Card>
    </div>
  );
}
