import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AssistantPage() {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-2">Mkindayzir Assistant</h1>
      <p className="text-muted-foreground mb-6">AI-powered help</p>
      <Card>
        <CardHeader>
          <CardTitle>Assistant</CardTitle>
          <CardDescription>Coming soon</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">The AI assistant will be available here.</p>
        </CardContent>
      </Card>
    </div>
  );
}
