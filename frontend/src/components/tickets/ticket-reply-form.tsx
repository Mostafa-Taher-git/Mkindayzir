import { useState } from "react";
import { TicketReply } from "@/types/ticket";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Lock, Send, Loader2 } from "lucide-react";

interface TicketReplyFormProps {
  ticketId: string;
  onReplyAdded: (reply: TicketReply) => void;
}

export function TicketReplyForm({ ticketId, onReplyAdded }: TicketReplyFormProps) {
  const [content, setContent] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!content.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/tickets/${ticketId}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          content: content.trim(),
          isInternal,
          type: isInternal ? "NOTE" : "REPLY",
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message || data?.message || "Failed to post reply");
      }

      const reply = await res.json();
      setContent("");
      setIsInternal(false);
      onReplyAdded(reply);
    } catch (err: any) {
      setError(err.message || "Could not submit reply");
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && (
        <div className="p-2.5 bg-destructive/10 border border-destructive/30 text-destructive text-xs font-medium">
          {error}
        </div>
      )}

      {/* Mode / Tabs Switcher */}
      <div className="flex items-center gap-2 text-xs font-mono">
        <button
          type="button"
          onClick={() => setIsInternal(false)}
          className={`px-3 py-1.5 border-2 transition-colors font-medium flex items-center gap-1.5 ${
            !isInternal
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-surface border-outline text-muted-foreground hover:text-foreground"
          }`}
        >
          <Send className="h-3 w-3" />
          Public Reply
        </button>

        <button
          type="button"
          onClick={() => setIsInternal(true)}
          className={`px-3 py-1.5 border-2 transition-colors font-medium flex items-center gap-1.5 ${
            isInternal
              ? "bg-amber-500 text-black border-amber-500 font-bold"
              : "bg-surface border-outline text-muted-foreground hover:text-foreground"
          }`}
        >
          <Lock className="h-3 w-3" />
          Internal Note
        </button>

        <span className="text-muted-foreground text-[11px] ml-auto hidden sm:inline">
          {isInternal
            ? "⚠️ Visible only to staff (customer cannot see this)"
            : "Customer will see this reply"}
        </span>
      </div>

      {/* Text Area */}
      <div
        className={`border-2 transition-colors ${
          isInternal
            ? "border-amber-500/60 bg-amber-500/5 dark:bg-amber-500/10"
            : "border-outline bg-surface"
        }`}
      >
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isInternal
              ? "Write an internal team note (Markdown supported)..."
              : "Write a reply to the customer (Markdown supported)..."
          }
          rows={5}
          className="border-none focus-visible:ring-0 resize-y font-mono text-sm leading-relaxed bg-transparent"
        />

        <div className="flex items-center justify-between p-2 border-t border-outline/40 bg-muted/20 text-xs font-mono text-muted-foreground">
          <span>Press Ctrl+Enter to submit</span>
          <Button
            type="submit"
            size="sm"
            disabled={!content.trim() || submitting}
            className={`font-mono flex items-center gap-1.5 ${
              isInternal ? "bg-amber-500 hover:bg-amber-600 text-black font-semibold" : ""
            }`}
          >
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Submitting...
              </>
            ) : isInternal ? (
              <>
                <Lock className="h-3.5 w-3.5" />
                Add Internal Note
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" />
                Send Reply
              </>
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}
