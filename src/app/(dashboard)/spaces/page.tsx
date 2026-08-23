
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ROUTES, VISIBILITIES } from "@/lib/constants";
import { Link } from "react-router-dom";

export default function SpacesPage() {
  const { data, isLoading } = useQuery<{ spaces: any[] }>({
    queryKey: ["spaces"],
    queryFn: async () => {
      const res = await fetch("/api/spaces", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch spaces");
      return res.json();
    },
  });

  const spaces = data?.spaces ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Spaces</h1>
          <p className="text-muted-foreground mt-1">Manage your workspaces and boards</p>
        </div>
        <Button asChild>
          <Link to={`${ROUTES.SPACES}/new`}>New Space</Link>
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading spaces...</p>
      ) : spaces.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Spaces</CardTitle>
            <CardDescription>No spaces yet.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Create your first space to organize your boards.</p>
            <Button asChild className="mt-4">
              <Link to={`${ROUTES.SPACES}/new`}>Create Space</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {spaces.map((space: any) => (
            <Link key={space.id} to={`${ROUTES.SPACES}/${space.id}`}>
              <Card className="h-full hover:shadow-md transition-shadow cursor-pointer">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{space.name}</CardTitle>
                    <Badge variant="secondary" className="text-xs">
                      {VISIBILITIES.find((v) => v.value === space.visibility)?.label ?? space.visibility}
                    </Badge>
                  </div>
                  <CardDescription className="line-clamp-2">
                    {space.description || "No description"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{space.memberCount} member{space.memberCount !== 1 ? "s" : ""}</span>
                    <span>{space.boardCount} board{space.boardCount !== 1 ? "s" : ""}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
