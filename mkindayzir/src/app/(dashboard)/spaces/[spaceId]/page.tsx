import { getSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ROUTES, VISIBILITIES } from "@/lib/constants";
import { Board } from "@/types";
import { SpaceForm } from "@/components/spaces/space-form";
import Link from "next/link";

interface SpaceDetailPageProps {
  params: Promise<{ spaceId: string }>;
}

async function getSpace(spaceId: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/spaces/${spaceId}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

async function getBoards(spaceId: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/boards?spaceId=${spaceId}`, {
    cache: "no-store",
  });
  if (!res.ok) return { boards: [] };
  return res.json();
}

async function getMembers(spaceId: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/spaces/${spaceId}/members`, {
    cache: "no-store",
  });
  if (!res.ok) return { members: [] };
  return res.json();
}

export default async function SpaceDetailPage({ params }: SpaceDetailPageProps) {
  const user = await getSessionUser();
  if (!user) {
    redirect(ROUTES.LOGIN);
  }

  const { spaceId } = await params;
  const { space } = await getSpace(spaceId);
  const { boards } = await getBoards(spaceId);
  const { members } = await getMembers(spaceId);

  if (!space) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">Space not found.</p>
            <Link href={ROUTES.SPACES} className="text-primary hover:underline mt-4 inline-block">
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
          <p className="text-muted-foreground mt-1">
            {space.description || "No description provided"}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            {space.memberCount} members
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link href={`${ROUTES.SPACES}/${spaceId}/boards/new`}>New Board</Link>
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
                <div className="text-sm text-muted-foreground">
                  No boards yet. Create your first board to get started.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {boards.map((board: Board) => (
                    <Link key={board.id} href={`/boards/${board.id}`}>
                      <div className="border-2 border-outline p-3 hover:border-primary transition-colors cursor-pointer">
                        <div
                          className="h-2 rounded-full mb-2"
                          style={{ backgroundColor: board.background }}
                        />
                        <p className="text-sm font-medium">{board.name}</p>
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {board.description || "No description"}
                        </p>
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
