"use client";

import * as React from "react";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { VAULT_ROUTES } from "@/lib/constants";
import { VaultNote, NoteStatus, NoteVersion } from "@/types";

import { cn } from "@/lib/utils";

function MarkdownRenderer({ content }: { content: string }) {
  const render = React.useMemo(() => {
    const lines = content.split("\n");
    const elements: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeContent = "";
    let codeLang = "";
    let codeKey = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith("```")) {
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeLang = line.slice(3).trim();
          codeContent = "";
          codeKey = i;
          continue;
        } else {
          inCodeBlock = false;
          elements.push(
            <div key={codeKey} className="my-3">
              {codeLang && (
                <div className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-t-md border-x border-t">
                  {codeLang}
                </div>
              )}
              <pre
                className={cn(
                  "bg-muted rounded-md p-3 overflow-x-auto text-xs",
                  codeLang && "rounded-t-none border-x border-b"
                )}
              >
                <code>{codeContent}</code>
              </pre>
            </div>
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
          <h1 key={i} className="text-3xl font-bold mt-6 mb-3">
            {line.slice(2)}
          </h1>
        );
      } else if (line.startsWith("## ")) {
        elements.push(
          <h2 key={i} className="text-2xl font-semibold mt-5 mb-2">
            {line.slice(3)}
          </h2>
        );
      } else if (line.startsWith("### ")) {
        elements.push(
          <h3 key={i} className="text-xl font-medium mt-4 mb-2">
            {line.slice(4)}
          </h3>
        );
      } else if (line.startsWith("- ")) {
        elements.push(
          <li key={i} className="ml-6 list-disc my-0.5">
            {line.slice(2)}
          </li>
        );
      } else if (line.startsWith("> ")) {
        elements.push(
          <blockquote
            key={i}
            className="border-l-4 border-primary pl-4 italic my-2 text-muted-foreground"
          >
            {line.slice(2)}
          </blockquote>
        );
      } else if (line.trim() === "") {
        elements.push(<div key={i} className="h-3" />);
      } else {
        let text = line;
        text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
        text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");
        text = text.replace(/`(.+?)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-xs">$1</code>');
        elements.push(
          <p
            key={i}
            dangerouslySetInnerHTML={{ __html: text }}
            className="my-1.5 leading-relaxed"
          />
        );
      }
    }
    return elements;
  }, [content]);

  return <div className="prose prose-sm max-w-none dark:prose-invert">{render}</div>;
}

export function NoteViewer({
  note,
  onEdit,
  onArchive,
  onDelete,
  showVersionHistory = true,
  versions,
  onRestoreVersion,
  backlinks,
  feedback,
  onFeedbackSubmit,
}: {
  note: VaultNote;
  onEdit?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
  showVersionHistory?: boolean;
  versions?: NoteVersion[];
  onRestoreVersion?: (version: NoteVersion) => void;
  backlinks?: { id: string; title: string; context: string | null }[];
  feedback?: { id: string; helpful: boolean; comment: string | null; userId: string; createdAt: string }[];
  onFeedbackSubmit?: (helpful: boolean, comment?: string) => Promise<void>;
}) {
  
  const [feedbackComment, setFeedbackComment] = React.useState("");
  const [feedbackHelpful, setFeedbackHelpful] = React.useState(true);
  const [showFeedbackForm, setShowFeedbackForm] = React.useState(false);
  const [showVersions, setShowVersions] = React.useState(false);

  const statusColors: Record<NoteStatus, string> = {
    DRAFT: "secondary",
    PUBLISHED: "default",
    ARCHIVED: "outline",
  };

  const initials = note.author?.displayName
    ?.split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant={statusColors[note.status] as any}>{note.status}</Badge>
            {note.tags?.map((tag) => (
              <span
                key={tag.id}
                className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
              >
                {tag.name}
              </span>
            ))}
          </div>
          <h1 className="text-3xl font-bold mb-2">{note.title || "Untitled"}</h1>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {note.author && (
              <div className="flex items-center gap-2">
                <Avatar className="h-6 w-6">
                  <AvatarImage src={note.author.avatar ?? ""} alt={note.author.displayName} />
                  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                </Avatar>
                <span>{note.author.displayName}</span>
              </div>
            )}
            <span>v{note.version}</span>
            <span>{new Date(note.updatedAt).toLocaleDateString()}</span>
            {note.publishedAt && (
              <span>Published {new Date(note.publishedAt).toLocaleDateString()}</span>
            )}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="1" />
                <circle cx="19" cy="12" r="1" />
                <circle cx="5" cy="12" r="1" />
              </svg>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onEdit && (
              <DropdownMenuItem onClick={onEdit}>
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
                  className="mr-2"
                >
                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                </svg>
                Edit
              </DropdownMenuItem>
            )}
            {onArchive && note.status !== "ARCHIVED" && (
              <DropdownMenuItem onClick={onArchive}>
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
                  className="mr-2"
                >
                  <rect width="20" height="5" x="2" y="3" rx="1" />
                  <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
                  <path d="M10 12h4" />
                </svg>
                Archive
              </DropdownMenuItem>
            )}
            {onDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={onDelete}
                >
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
                    className="mr-2"
                  >
                    <path d="M3 6h18" />
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                  </svg>
                  Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="border rounded-lg p-6 mb-6 bg-card">
        {note.content ? (
          <MarkdownRenderer content={note.content} />
        ) : (
          <p className="text-muted-foreground">This note has no content.</p>
        )}
      </div>

      {backlinks && backlinks.length > 0 && (
        <div className="border rounded-lg p-4 mb-6">
          <h3 className="font-semibold mb-3 text-sm">Backlinks</h3>
          <div className="space-y-2">
            {backlinks.map((link) => (
              <Link
                key={link.id}
                href={`${VAULT_ROUTES.NOTES}/${link.id}`}
                className="block text-sm hover:text-primary transition-colors"
              >
                <span className="font-medium">{link.title}</span>
                {link.context && (
                  <span className="text-muted-foreground ml-2">
                    ...{link.context}...
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="border rounded-lg p-4 mb-6">
        <h3 className="font-semibold mb-3 text-sm">Feedback</h3>
        {feedback && feedback.length > 0 && (
          <div className="space-y-3 mb-4">
            {feedback.map((fb) => (
              <div key={fb.id} className="border-b pb-2 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">
                    {fb.helpful ? "Helpful" : "Not helpful"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(fb.createdAt).toLocaleDateString()}
                  </span>
                </div>
                {fb.comment && (
                  <p className="text-sm text-muted-foreground mt-1">{fb.comment}</p>
                )}
              </div>
            ))}
          </div>
        )}
        {!showFeedbackForm ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFeedbackForm(true)}
          >
            Add Feedback
          </Button>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Button
                variant={feedbackHelpful ? "default" : "outline"}
                size="sm"
                onClick={() => setFeedbackHelpful(true)}
              >
                Helpful
              </Button>
              <Button
                variant={!feedbackHelpful ? "destructive" : "outline"}
                size="sm"
                onClick={() => setFeedbackHelpful(false)}
              >
                Not Helpful
              </Button>
            </div>
            <textarea
              placeholder="Add a comment (optional)"
              value={feedbackComment}
              onChange={(e) => setFeedbackComment(e.target.value)}
              className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={async () => {
                  await onFeedbackSubmit?.(feedbackHelpful, feedbackComment || undefined);
                  setShowFeedbackForm(false);
                  setFeedbackComment("");
                }}
              >
                Submit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowFeedbackForm(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {showVersionHistory && versions && versions.length > 1 && (
        <div className="border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">Version History</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowVersions(!showVersions)}
            >
              {showVersions ? "Hide" : "Show"} Versions
            </Button>
          </div>
          {showVersions && (
            <div className="space-y-2">
              {versions.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between text-sm border-b pb-2 last:border-0"
                >
                  <div>
                    <span className="font-medium">v{v.version}</span>
                    <span className="text-muted-foreground ml-2">
                      {new Date(v.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {onRestoreVersion && v.version !== note.version && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRestoreVersion(v)}
                    >
                      Restore
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
