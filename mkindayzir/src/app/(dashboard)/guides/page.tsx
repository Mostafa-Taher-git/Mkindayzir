import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function GuidesPage() {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-2">Guide Center</h1>
      <p className="text-muted-foreground mb-6">Help and documentation</p>
      <Card>
        <CardHeader>
          <CardTitle>Guides</CardTitle>
          <CardDescription>No guides yet.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Check back later for helpful guides and documentation.</p>
        </CardContent>
      </Card>
    </div>
  );
}
