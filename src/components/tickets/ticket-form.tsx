import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Ticket } from "@/types/ticket";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  PRIORITIES,
  TICKET_CATEGORIES,
  ROUTES,
} from "@/lib/constants";
import { Loader2 } from "lucide-react";

interface TicketFormProps {
  initialData?: Partial<Ticket>;
  ticketId?: string;
  isEdit?: boolean;
}

export function TicketForm({ initialData, ticketId, isEdit = false }: TicketFormProps) {
  const navigate = useNavigate();

  const [subject, setSubject] = useState(initialData?.subject || "");
  const [description, setDescription] = useState(initialData?.description || "");
  const [priority, setPriority] = useState(initialData?.priority || "MEDIUM");
  const [category, setCategory] = useState(initialData?.category || "GENERAL");
  const [assigneeId, setAssigneeId] = useState(initialData?.assigneeId || "");
  const [projectId, setProjectId] = useState(initialData?.projectId || "");
  const [dueDate, setDueDate] = useState(
    initialData?.dueDate ? new Date(initialData.dueDate).toISOString().slice(0, 16) : ""
  );
  const [tagsInput, setTagsInput] = useState(
    initialData?.tags ? initialData.tags.join(", ") : ""
  );

  const [users, setUsers] = useState<Array<{ id: string; displayName: string; email: string }>>([]);
  const [projects, setProjects] = useState<Array<{ id: string; name: string; key: string }>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Fetch users for assignee dropdown
    fetch("/api/admin/users", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.users) {
          setUsers(data.users);
        } else if (Array.isArray(data)) {
          setUsers(data);
        }
      })
      .catch(() => {});

    // Fetch projects for project association
    fetch("/api/projects", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.projects) {
          setProjects(data.projects);
        } else if (Array.isArray(data)) {
          setProjects(data);
        }
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) {
      setError("Subject is required.");
      return;
    }
    if (!description.trim()) {
      setError("Description is required.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const payload: any = {
      subject: subject.trim(),
      description: description.trim(),
      priority,
      category,
      assigneeId: assigneeId || null,
      projectId: projectId || null,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      tags,
    };

    try {
      const url = isEdit && ticketId ? `/api/tickets/${ticketId}` : "/api/tickets";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message || data?.message || "Failed to save ticket");
      }

      const saved = await res.json();
      const newTicketId = saved.id || ticketId;
      navigate(`/tickets/${newTicketId}`);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
      {error && (
        <div className="p-3 bg-destructive/10 border-2 border-destructive/30 text-destructive text-sm font-medium">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="text-xs font-mono uppercase tracking-wider block mb-1 font-semibold">
            Subject *
          </label>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Brief summary of the issue or request"
            className="font-medium"
            required
          />
        </div>

        <div>
          <label className="text-xs font-mono uppercase tracking-wider block mb-1 font-semibold">
            Description *
          </label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Detailed information regarding the ticket (Markdown supported)..."
            rows={8}
            className="font-mono text-sm leading-relaxed"
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-mono uppercase tracking-wider block mb-1">
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full px-3 py-2 border-2 border-outline bg-surface font-mono text-sm text-foreground focus:border-primary focus:outline-none"
            >
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-mono uppercase tracking-wider block mb-1">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 border-2 border-outline bg-surface font-mono text-sm text-foreground focus:border-primary focus:outline-none"
            >
              {TICKET_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-mono uppercase tracking-wider block mb-1">
              Assignee
            </label>
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="w-full px-3 py-2 border-2 border-outline bg-surface font-mono text-sm text-foreground focus:border-primary focus:outline-none"
            >
              <option value="">Unassigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName} ({u.email})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-mono uppercase tracking-wider block mb-1">
              Related Project
            </label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full px-3 py-2 border-2 border-outline bg-surface font-mono text-sm text-foreground focus:border-primary focus:outline-none"
            >
              <option value="">None / General</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  [{p.key}] {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-mono uppercase tracking-wider block mb-1">
              SLA Due Date
            </label>
            <Input
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="font-mono text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-mono uppercase tracking-wider block mb-1">
              Tags (comma separated)
            </label>
            <Input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="e.g. billing, urgent, api"
              className="font-mono text-sm"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-4 border-t border-outline">
        <Button type="submit" disabled={submitting} className="font-mono">
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : isEdit ? (
            "Update Ticket"
          ) : (
            "Create Ticket"
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => navigate(ticketId ? `/tickets/${ticketId}` : ROUTES.TICKETS)}
          disabled={submitting}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
