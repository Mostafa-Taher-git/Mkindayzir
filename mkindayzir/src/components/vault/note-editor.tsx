"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NOTE_STATUSES } from "@/lib/constants";
import { VaultNote, VaultFolder, Tag, NoteStatus } from "@/types";

import { cn } from "@/lib/utils";

interface NoteEditorProps {
  note?: VaultNote;
  folders: VaultFolder[];
  availableTags: Tag[];
  onSave: (data: {
    title: string;
    content: string;
    folderId: string | null;
    tagIds: string[];
    status: NoteStatus;
  }) => Promise<void>;
  saving?: boolean;
}

const TOOLBAR_ITEMS = [
  { label: "B", title: "Bold", action: () => wrapSelection("**", "**") },
  { label: "I", title: "Italic", action: () => wrapSelection("*", "*") },
  { label: "H1", title: "Heading 1", action: () => wrapLine("# ") },
  { label: "H2", title: "Heading 2", action: () => wrapLine("## ") },
  { label: "H3", title: "Heading 3", action: () => wrapLine("### ") },
  { label: '"', title: "Quote", action: () => wrapLine("> ") },
  { label: "-", title: "List", action: () => wrapLine("- ") },
  { label: "1.", title: "Numbered List", action: () => wrapLine("1. ") },
  { label: "`", title: "Code", action: () => wrapSelection("`", "`") },
  { label: "[]", title: "Link", action: () => wrapSelection("[", "](url)") },
];

function wrapSelection(before: string, after: string) {
  const textarea = document.querySelector(
    'textarea[data-editor="true"]'
  ) as HTMLTextAreaElement | null;
  if (!textarea) return;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const value = textarea.value;
  const selected = value.slice(start, end);
  textarea.value = value.slice(0, start) + before + selected + after + value.slice(end);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.focus();
  textarea.setSelectionRange(start + before.length, end + before.length);
}

function wrapLine(prefix: string) {
  const textarea = document.querySelector(
    'textarea[data-editor="true"]'
  ) as HTMLTextAreaElement | null;
  if (!textarea) return;
  const start = textarea.selectionStart;
  const value = textarea.value;
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = value.indexOf("\n", start);
  const currentLine = value.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
  textarea.value =
    value.slice(0, lineStart) + prefix + currentLine + value.slice(lineEnd === -1 ? value.length : lineEnd);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.focus();
}

export function NoteEditor({
  note,
  folders,
  availableTags,
  onSave,
  saving = false,
}: NoteEditorProps) {
  const router = useRouter();
  const [title, setTitle] = React.useState(note?.title || "");
  const [content, setContent] = React.useState(note?.content || "");
  const [folderId, setFolderId] = React.useState<string>(note?.folderId || "none");
  const [selectedTagIds, setSelectedTagIds] = React.useState<string[]>(
    note?.tags?.map((t) => t.id) || []
  );
  const [status, setStatus] = React.useState<NoteStatus>(note?.status || "DRAFT");
  const [activeTab, setActiveTab] = React.useState<string>("write");

  const rootFolders = folders.filter((f) => !f.parentId);

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  const handleSave = async (publish = false) => {
    await onSave({
      title,
      content,
      folderId: folderId === "none" ? null : folderId,
      tagIds: selectedTagIds,
      status: publish ? "PUBLISHED" : status,
    });
  };

  const renderMarkdown = (md: string) => {
    const lines = md.split("\n");
    const elements: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeContent = "";
    let codeLang = "";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith("```")) {
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeLang = line.slice(3).trim();
          codeContent = "";
          continue;
        } else {
          inCodeBlock = false;
          elements.push(
            <pre
              key={i}
              className="bg-muted rounded-md p-3 overflow-x-auto text-xs my-2"
            >
              <code className={cn("language-" + codeLang)}>{codeContent}</code>
            </pre>
          );
          continue;
        }
      }
      if (inCodeBlock) {
        codeContent += line + "\n";
        continue;
      }
      if (line.startsWith("# ")) {
        elements.push(
          <h1 key={i} className="text-2xl font-bold mt-4 mb-2">
            {line.slice(2)}
          </h1>
        );
      } else if (line.startsWith("## ")) {
        elements.push(
          <h2 key={i} className="text-xl font-semibold mt-3 mb-2">
            {line.slice(3)}
          </h2>
        );
      } else if (line.startsWith("### ")) {
        elements.push(
          <h3 key={i} className="text-lg font-medium mt-2 mb-1">
            {line.slice(4)}
          </h3>
        );
      } else if (line.startsWith("- ")) {
        elements.push(
          <li key={i} className="ml-4 list-disc">
            {line.slice(2)}
          </li>
        );
      } else if (line.startsWith("> ")) {
        elements.push(
          <blockquote key={i} className="border-l-4 border-muted-foreground pl-4 italic text-muted-foreground">
            {line.slice(2)}
          </blockquote>
        );
      } else if (line.trim() === "") {
        elements.push(<br key={i} />);
      } else {
        let text = line;
        text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
        text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");
        text = text.replace(/`(.+?)`/g, "<code>$1</code>");
        text = text.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
        elements.push(
          <p
            key={i}
            dangerouslySetInnerHTML={{ __html: text }}
            className="my-1"
          />
        );
      }
    }
    return elements;
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          {note ? "Edit Note" : "New Note"}
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={() => handleSave(false)} disabled={saving}>
            {saving ? "Saving..." : "Save Draft"}
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

      <div className="flex gap-3">
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
        {!note && (
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as NoteStatus)}
            className="h-9 rounded-md border bg-transparent px-3 py-2 text-sm"
          >
            {NOTE_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        )}
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

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="write">Write</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>
        <TabsContent value="write" className="space-y-2">
          <div className="flex items-center gap-1 border-b pb-2">
            {TOOLBAR_ITEMS.map((item) => (
              <Button
                key={item.title}
                variant="ghost"
                size="sm"
                className="h-7 w-7 text-xs font-mono"
                onClick={item.action}
                title={item.title}
              >
                {item.label}
              </Button>
            ))}
          </div>
          <Textarea
            data-editor="true"
            placeholder="Write your note in Markdown..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="min-h-[400px] font-mono text-sm resize-y"
          />
        </TabsContent>
        <TabsContent value="preview">
          <div className="min-h-[400px] border rounded-md p-4 prose prose-sm max-w-none dark:prose-invert">
            {content ? renderMarkdown(content) : (
              <p className="text-muted-foreground">Nothing to preview yet.</p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
