import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function BoardsPage() {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-2">Boards</h1>
      <p className="text-muted-foreground mb-6">Visual task boards</p>
      <Card>
        <CardHeader>
          <CardTitle>Boards</CardTitle>
          <CardDescription>No boards yet.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Create a board to start organizing tasks.</p>
        </CardContent>
      </Card>
    </div>
  );
}
