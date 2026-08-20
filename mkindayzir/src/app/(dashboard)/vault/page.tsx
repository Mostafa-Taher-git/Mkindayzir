import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function VaultPage() {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-2">Knowledge Vault</h1>
      <p className="text-muted-foreground mb-6">Team knowledge base</p>
      <Card>
        <CardHeader>
          <CardTitle>Vault</CardTitle>
          <CardDescription>No entries yet.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Add your first knowledge entry to get started.</p>
        </CardContent>
      </Card>
    </div>
  );
}
