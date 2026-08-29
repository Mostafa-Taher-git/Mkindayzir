
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ROUTES, VISIBILITIES } from "@/lib/constants";
import { Board } from "@/types";
import { SpaceForm } from "@/components/spaces/space-form";
import { api } from "@/lib/api";

export default function SpaceDetailPage() {
  const { spaceId } = useParams<{ spaceId: string }>();

  const { data: spaceData } = useQuery<{ space: any }>({
    queryKey: ["space", spaceId],
    enabled: Boolean(spaceId),
    queryFn: async () => {
      const res = await api.get<{ space: any }>(`/api/spaces/${spaceId}`);
      if (!res.ok) throw new Error("Failed to fetch space");
      return res.json();
    },
  });

  const { data: boardsData } = useQuery<{ boards: any[] }>({
    queryKey: ["boards", "bySpace", spaceId],
    enabled: Boolean(spaceId),
    queryFn: async () => {
      const res = await api.get<{ boards: any[] }>(`/api/boards?spaceId=${spaceId}`);
      if (!res.ok) throw new Error("Failed to fetch boards");
      return res.json();
    },
  });

  const { data: membersData } = useQuery<{ members: any[] }>({
    queryKey: ["space", spaceId, "members"],
    enabled: Boolean(spaceId),
    queryFn: async () => {
      const res = await api.get<{ members: any[] }>(`/api/spaces/${spaceId}/members`);
      if (!res.ok) return { members: [] };
      return res.json();
    },
  });

  const space = spaceData?.space;
  const boards = boardsData?.boards ?? [];
  const members = membersData?.members ?? [];

  if (!space) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">Space not found.</p>
            <Link to={ROUTES.SPACES} className="text-primary hover:underline mt-4 inline-block">
              Back to Spaces
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const visibilityLabel = VISIBILITIES.find((v) => v.value === space.visibility)?.label ?? space.visibility;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{space.name}</h1>
            <Badge variant="secondary" className="text-xs">{visibilityLabel}</Badge>
          </div>
          <p className="text-muted-foreground mt-1">{space.description || "No description provided"}</p>
          <p className="text-xs text-muted-foreground mt-2">{space.memberCount} members</p>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link to={`${ROUTES.SPACES}/${spaceId}/boards/new`}>New Board</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Boards</CardTitle>
              <CardDescription>{boards.length} board{boards.length !== 1 ? "s" : ""} in this space</CardDescription>
            </CardHeader>
            <CardContent>
              {boards.length === 0 ? (
                <div className="text-sm text-muted-foreground">No boards yet. Create your first board to get started.</div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {boards.map((board: Board) => (
                    <Link key={board.id} to={`/boards/${board.id}`}>
                      <div className="border-2 border-outline p-3 hover:border-primary transition-colors cursor-pointer">
                        <div className="h-2 rounded-full mb-2" style={{ backgroundColor: board.background }} />
                        <p className="text-sm font-medium">{board.name}</p>
                        <p className="text-xs text-muted-foreground line-clamp-1">{board.description || "No description"}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Members</CardTitle>
              <CardDescription>{members.length} member{members.length !== 1 ? "s" : ""}</CardDescription>
            </CardHeader>
            <CardContent>
              {members.length === 0 ? (
                <p className="text-sm text-muted-foreground">No members yet.</p>
              ) : (
                <div className="space-y-2">
                  {members.map((member: { id: string; user?: { displayName: string }; role: string }) => (
                    <div key={member.id} className="flex items-center justify-between">
                      <span className="text-sm">{member.user?.displayName ?? "Unknown"}</span>
                      <Badge variant="outline" className="text-xs">{member.role}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <SpaceForm space={space} onSuccess={() => {}} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}