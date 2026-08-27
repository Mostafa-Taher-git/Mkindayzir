
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { VAULT_ROUTES } from "@/lib/constants";
import { VaultFolder, Tag } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VaultSidebar } from "@/components/vault/vault-sidebar";
import { TagCloud } from "@/components/vault/tag-cloud";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";

const PRESET_COLORS = ["#94a3b8", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"];

export default function VaultTagsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);

  const { data: foldersData } = useQuery<{ folders: VaultFolder[] }>({
    queryKey: ["vault", "folders"],
    queryFn: () => api.get<{ folders: VaultFolder[] }>("/api/vault/folders"),
  });

  const { data: tagsData } = useQuery<{ tags: Tag[] }>({
    queryKey: ["vault", "tags"],
    queryFn: () => api.get<{ tags: Tag[] }>("/api/vault/tags"),
  });

  const createTag = useMutation({
    mutationFn: (data: { name: string; color: string }) =>
      api.post<{ tag: Tag }>("/api/vault/tags", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vault", "tags"] });
      setName("");
      setColor(PRESET_COLORS[0]);
      toast({ title: "Tag created" });
    },
    onError: (e) => toast({ title: "Failed to create", description: String(e) }),
  });

  const deleteTag = useMutation({
    mutationFn: (id: string) => api.delete(`/api/vault/tags/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vault", "tags"] });
      toast({ title: "Tag deleted" });
    },
    onError: (e) => toast({ title: "Cannot delete", description: String(e) }),
  });

  const folders = foldersData?.folders ?? [];
  const tags = tagsData?.tags ?? [];

  function onCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    createTag.mutate({ name: trimmed, color });
  }

  function onDelete(tag: Tag) {
    if (!confirm(`Delete tag "${tag.name}"? It will be removed from all notes.`)) return;
    deleteTag.mutate(tag.id);
  }

  return (
    <div className="flex h-full">
      <VaultSidebar folders={folders} currentFolderId={null} />
      <div className="flex-1 overflow-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Tags</h1>
            <p className="text-muted-foreground mt-1">Organize and filter your notes with tags</p>
          </div>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Create tag</CardTitle>
            <CardDescription>Add a new tag to use across notes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-3 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Name</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") onCreate(); }}
                  placeholder="e.g. runbooks"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Color</label>
                <div className="flex items-center gap-1.5">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={
                        "h-7 w-7 rounded border-2 transition-transform " +
                        (color === c ? "border-foreground scale-110" : "border-outline")
                      }
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                  ))}
                </div>
              </div>
              <Button onClick={onCreate} disabled={createTag.isPending || !name.trim()}>
                {createTag.isPending ? "Creating…" : "Create tag"}
              </Button>
            </div>
          </CardContent>
        </Card>

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
            <CardDescription>{tags.length} tag{tags.length === 1 ? "" : "s"} total</CardDescription>
          </CardHeader>
          <CardContent>
            {tags.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No tags yet. Create one above.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {tags.map((tag) => (
                  <div
                    key={tag.id}
                    className="flex items-center justify-between border-2 border-outline p-3 hover:border-primary transition-colors"
                  >
                    <Link
                      to={`${VAULT_ROUTES.HOME}?tag=${tag.id}`}
                      className="flex items-center gap-2 flex-1 no-underline text-foreground"
                    >
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: tag.color || "#94a3b8" }} />
                      <span className="text-sm font-medium">{tag.name}</span>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.preventDefault(); onDelete(tag); }}
                      title="Delete tag"
                    >
                      Delete
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
