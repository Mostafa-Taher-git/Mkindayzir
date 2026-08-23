import { useState, useEffect } from "react";
import { Ticket } from "@/types/ticket";
import {
  TicketStatusBadge,
  TicketPriorityBadge,
  TicketCategoryBadge,
  SlaBreachedBadge,
} from "./ticket-status-badge";
import { Button } from "@/components/ui/button";
import {
  TICKET_STATUSES,
  PRIORITIES,
  TICKET_CATEGORIES,
} from "@/lib/constants";
import {
  User,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FolderKanban,
  Building,
  Mail,
  Calendar,
  RotateCcw,
  Trash2,
} from "lucide-react";

interface TicketSidebarProps {
  ticket: Ticket;
  currentUserId?: string;
  onUpdate: (updated: Partial<Ticket>) => void;
  onClose: () => void;
  onReopen: () => void;
  onDelete: () => void;
}

export function TicketSidebar({
  ticket,
  currentUserId,
  onUpdate,
  onClose,
  onReopen,
  onDelete,
}: TicketSidebarProps) {
  const [users, setUsers] = useState<Array<{ id: string; displayName: string; email: string }>>([]);

  useEffect(() => {
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
  }, []);

  const handleStatusChange = (newStatus: string) => {
    onUpdate({ status: newStatus });
  };

  const handlePriorityChange = (newPriority: string) => {
    onUpdate({ priority: newPriority });
  };

  const handleCategoryChange = (newCategory: string) => {
    onUpdate({ category: newCategory });
  };

  const handleAssigneeChange = (newAssigneeId: string) => {
    onUpdate({ assigneeId: newAssigneeId || null });
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return "None";
    const date = new Date(isoString);
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-6">
      {/* Properties Card */}
      <div className="border-2 border-outline bg-surface p-4 space-y-4">
        <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-outline pb-2">
          Ticket Details
        </h3>

        {/* Status */}
        <div className="space-y-1">
          <label className="text-[11px] font-mono uppercase text-muted-foreground">
            Status
          </label>
          <select
            value={ticket.status}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="w-full px-2.5 py-1.5 border-2 border-outline bg-background font-mono text-xs text-foreground focus:border-primary focus:outline-none"
          >
            {TICKET_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {/* Priority */}
        <div className="space-y-1">
          <label className="text-[11px] font-mono uppercase text-muted-foreground">
            Priority
          </label>
          <select
            value={ticket.priority}
            onChange={(e) => handlePriorityChange(e.target.value)}
            className="w-full px-2.5 py-1.5 border-2 border-outline bg-background font-mono text-xs text-foreground focus:border-primary focus:outline-none"
          >
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {/* Category */}
        <div className="space-y-1">
          <label className="text-[11px] font-mono uppercase text-muted-foreground">
            Category
          </label>
          <select
            value={ticket.category || "GENERAL"}
            onChange={(e) => handleCategoryChange(e.target.value)}
            className="w-full px-2.5 py-1.5 border-2 border-outline bg-background font-mono text-xs text-foreground focus:border-primary focus:outline-none"
          >
            {TICKET_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {/* Assignee */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-mono uppercase text-muted-foreground">
              Assignee
            </label>
            {currentUserId && ticket.assigneeId !== currentUserId && (
              <button
                type="button"
                onClick={() => handleAssigneeChange(currentUserId)}
                className="text-[10px] font-mono text-primary hover:underline"
              >
                Assign to me
              </button>
            )}
          </div>
          <select
            value={ticket.assigneeId || ""}
            onChange={(e) => handleAssigneeChange(e.target.value)}
            className="w-full px-2.5 py-1.5 border-2 border-outline bg-background font-mono text-xs text-foreground focus:border-primary focus:outline-none"
          >
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName}
              </option>
            ))}
          </select>
        </div>

        {/* Project */}
        {ticket.project && (
          <div className="space-y-1 pt-2 border-t border-outline/50">
            <label className="text-[11px] font-mono uppercase text-muted-foreground">
              Linked Project
            </label>
            <div className="flex items-center gap-1.5 text-xs font-mono">
              <FolderKanban className="h-3.5 w-3.5 text-primary" />
              <span>[{ticket.project.key}] {ticket.project.name}</span>
            </div>
          </div>
        )}

        {/* Customer (if any) */}
        {ticket.customer && (
          <div className="space-y-1.5 pt-2 border-t border-outline/50">
            <label className="text-[11px] font-mono uppercase text-muted-foreground">
              Customer
            </label>
            <div className="text-xs font-mono space-y-1">
              <div className="font-semibold">{ticket.customer.displayName}</div>
              <div className="text-muted-foreground flex items-center gap-1">
                <Mail className="h-3 w-3" />
                {ticket.customer.email}
              </div>
              {ticket.customer.company && (
                <div className="text-muted-foreground flex items-center gap-1">
                  <Building className="h-3 w-3" />
                  {ticket.customer.company}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* SLA & Tracking Card */}
      <div className="border-2 border-outline bg-surface p-4 space-y-3 font-mono text-xs">
        <h3 className="font-bold uppercase tracking-wider text-muted-foreground border-b border-outline pb-2 text-[11px]">
          SLA & Timelines
        </h3>

        {/* SLA Status */}
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">SLA Status:</span>
          {ticket.slaBreached ? (
            <SlaBreachedBadge />
          ) : (
            <span className="text-emerald-500 font-semibold flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> On Track
            </span>
          )}
        </div>

        {/* Due Date */}
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">SLA Target:</span>
          <span>{formatDate(ticket.dueDate)}</span>
        </div>

        {/* First Response */}
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">First Response:</span>
          <span>{formatDate(ticket.firstResponseAt)}</span>
        </div>

        {/* Resolved At */}
        {ticket.resolvedAt && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Resolved At:</span>
            <span>{formatDate(ticket.resolvedAt)}</span>
          </div>
        )}

        {/* Closed At */}
        {ticket.closedAt && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Closed At:</span>
            <span>{formatDate(ticket.closedAt)}</span>
          </div>
        )}

        {/* Created At */}
        <div className="flex items-center justify-between pt-2 border-t border-outline/50 text-[11px]">
          <span className="text-muted-foreground">Created:</span>
          <span>{formatDate(ticket.createdAt)}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="border-2 border-outline bg-surface p-4 space-y-2 font-mono">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
          Actions
        </h3>

        {ticket.status === "CLOSED" ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onReopen}
            className="w-full flex items-center justify-center gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reopen Ticket
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="w-full flex items-center justify-center gap-1.5 hover:border-destructive hover:text-destructive"
          >
            <XCircle className="h-3.5 w-3.5" />
            Close Ticket
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={onDelete}
          className="w-full flex items-center justify-center gap-1.5 text-destructive hover:bg-destructive/10 hover:border-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete Ticket
        </Button>
      </div>
    </div>
  );
}
