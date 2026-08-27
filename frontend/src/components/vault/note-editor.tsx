import { useNavigate } from "react-router-dom";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { VaultNote, VaultFolder, Tag, NoteStatus } from "@/types";
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
    status: NoteStatus;
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
  const [status, setStatus] = React.useState<NoteStatus>(note?.status || "DRAFT");

  const rootFolders = folders.filter((f) => !f.parentId);

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  const handleSave = async (publish: boolean) => {
    if (!onSave) return;
    const nextStatus: NoteStatus = publish ? "PUBLISHED" : status;
    if (publish) setStatus("PUBLISHED");
    await onSave({
      title,
      content,
      folderId: folderId === "none" ? null : folderId,
      tagIds: selectedTagIds,
      status: nextStatus,
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
          <Button variant="secondary" onClick={() => handleSave(false)} disabled={saving}>
            {saving ? "Saving..." : "Save draft"}
          </Button>
          <Button onClick={() => handleSave(true)} disabled={saving}>
            {saving ? "Publishing..." : "Publish"}
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
        <select
          value={folderId}
          onChange={(e) => setFolderId(e.target.value)}
          className="h-9 rounded-md border bg-transparent px-3 py-2 text-sm"
        >
          <option value="none">No Folder</option>
          {rootFolders.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folder.name}
            </option>
          ))}
        </select>
      </div>

      {availableTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {availableTags.map((tag) => {
            const selected = selectedTagIds.includes(tag.id);
            return (
              <button
                key={tag.id}
                onClick={() => toggleTag(tag.id)}
                className={cn(
                  "text-xs px-2.5 py-1 rounded-full border transition-colors",
                  selected
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-accent border-input"
                )}
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
