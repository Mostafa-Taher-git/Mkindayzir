
import { api } from "@/lib/api";
import { VAULT_ROUTES } from "@/lib/constants";
import { VaultFolder, Tag } from "@/types";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { VaultSidebar } from "@/components/vault/vault-sidebar";
import { TagCloud } from "@/components/vault/tag-cloud";
import Link from "next/link";

async function getFolders() {
  try {
    const data = await api.get<{ folders: VaultFolder[] }>("/api/vault/folders");
    return data.folders || [];
  } catch {
    return [];
  }
}

async function getTags() {
  try {
    const data = await api.get<{ tags: Tag[] }>("/api/vault/tags");
    return data.tags || [];
  } catch {
    return [];
  }
}

export default async function VaultTagsPage() {
  
  const [folders, tags] = await Promise.all([getFolders(), getTags()]);

  return (
    <div className="flex h-full">
      <VaultSidebar
        folders={folders}
        currentFolderId={null}
      />
      <div className="flex-1 overflow-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Tags</h1>
            <p className="text-muted-foreground mt-1">
              Organize and filter your notes with tags
            </p>
          </div>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Tag Cloud</CardTitle>
            <CardDescription>Click a tag to filter notes</CardDescription>
          </CardHeader>
          <CardContent>
            <TagCloud tags={tags} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>All Tags</CardTitle>
            <CardDescription>{tags.length} tags total</CardDescription>
          </CardHeader>
          <CardContent>
            {tags.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No tags yet. Tags are created when you add them to notes.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {tags.map((tag) => (
                  <Link
                    key={tag.id}
                    href={`${VAULT_ROUTES.HOME}?tag=${tag.id}`}
                    className="flex items-center justify-between border-2 border-outline p-3 hover:border-primary transition-colors no-underline"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{
                          backgroundColor: tag.color || "#94a3b8",
                        }}
                      />
                      <span className="text-sm font-medium">{tag.name}</span>
                    </div>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-muted-foreground"
                    >
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
