import { useNavigate } from "react-router-dom";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { VaultNote, VaultFolder, Tag } from "@/types";
import { cn } from "@/lib/utils";

interface NoteEditorProps {
  note?: VaultNote;
  folders: VaultFolder[];
  availableTags: Tag[];
  onSave?: (data: {
    title: string;
    content: string;
    folderId: string | null;
    tagIds: string[];
  }) => Promise<void>;
  saving?: boolean;
}

export function NoteEditor({
  note,
  folders,
  availableTags,
  onSave,
  saving = false,
}: NoteEditorProps) {
  const navigate = useNavigate();
  const [title, setTitle] = React.useState(note?.title || "");
  const [content, setContent] = React.useState(note?.content || "");
  const [folderId, setFolderId] = React.useState<string>(note?.folderId || "none");
  const [selectedTagIds, setSelectedTagIds] = React.useState<string[]>(
    note?.tags?.map((t) => t.id) || []
  );

  const allFolderOptions = React.useMemo(() => {
    type FolderLike = { id: string; name: string; children?: FolderLike[] };
    const out: { id: string; name: string; depth: number }[] = [];
    function walk(list: FolderLike[], depth: number) {
      for (const f of list ?? []) {
        out.push({ id: f.id, name: f.name, depth });
        if (f.children?.length) walk(f.children, depth + 1);
      }
    }
    walk(folders as FolderLike[], 0);
    return out;
  }, [folders]);

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  const handleSave = async () => {
    if (!onSave) return;
    await onSave({
      title,
      content,
      folderId: folderId === "none" ? null : folderId,
      tagIds: selectedTagIds,
    });
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          {note ? "Edit Note" : "New Note"}
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      <Input
        placeholder="Note title..."
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="text-lg font-semibold"
      />

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">
          Folder
        </label>
        <select
          value={folderId}
          onChange={(e) => setFolderId(e.target.value)}
          className="h-9 rounded-md border bg-transparent px-3 py-2 text-sm"
        >
          <option value="none">No Folder</option>
          {allFolderOptions.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {"\u2014\u2014".repeat(folder.depth) + (folder.depth > 0 ? " " : "") + folder.name}
            </option>
          ))}
        </select>
      </div>

      {availableTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {availableTags.map((tag) => {
            const selected = selectedTagIds.includes(tag.id);
            const tintStyle = tag.color
              ? {
                  backgroundColor: selected ? tag.color : `${tag.color}22`,
                  color: selected ? "#fff" : tag.color,
                  borderColor: selected ? tag.color : `${tag.color}55`,
                }
              : undefined;
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag.id)}
                className={cn(
                  "text-xs px-2.5 py-1 rounded-full border transition-colors",
                  !tintStyle && (selected
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-accent border-input"),
                )}
                style={tintStyle}
              >
                {tag.name}
              </button>
            );
          })}
        </div>
      )}

      <Textarea
        placeholder="Write your note..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="min-h-[400px] text-sm resize-y"
      />
    </div>
  );
}
