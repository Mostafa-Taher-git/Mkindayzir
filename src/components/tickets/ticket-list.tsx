import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Ticket } from "@/types/ticket";
import {
  TicketStatusBadge,
  TicketPriorityBadge,
  TicketCategoryBadge,
  SlaBreachedBadge,
} from "./ticket-status-badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TICKET_STATUSES,
  TICKET_CATEGORIES,
  PRIORITIES,
  ROUTES,
} from "@/lib/constants";
import { Search, Plus, MessageSquare, User, Filter, AlertTriangle } from "lucide-react";

interface TicketListProps {
  tickets: Ticket[];
  isLoading: boolean;
  page: number;
  totalPages: number;
  total: number;
  search: string;
  status: string;
  priority: string;
  category: string;
  slaBreachedOnly: boolean;
  onSearchChange: (search: string) => void;
  onStatusChange: (status: string) => void;
  onPriorityChange: (priority: string) => void;
  onCategoryChange: (category: string) => void;
  onSlaBreachedChange: (breached: boolean) => void;
  onPageChange: (page: number) => void;
}

export function TicketList({
  tickets,
  isLoading,
  page,
  totalPages,
  total,
  search,
  status,
  priority,
  category,
  slaBreachedOnly,
  onSearchChange,
  onStatusChange,
  onPriorityChange,
  onCategoryChange,
  onSlaBreachedChange,
  onPageChange,
}: TicketListProps) {
  const navigate = useNavigate();

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return "-";
    const date = new Date(isoString);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-4">
      {/* Search & Filter Bar */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="flex-1 flex flex-wrap gap-2 items-center">
          <div className="relative min-w-[220px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tickets..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9 font-mono text-sm"
            />
          </div>

          <select
            value={status}
            onChange={(e) => onStatusChange(e.target.value)}
            aria-label="Filter by status"
            className="px-3 py-2 border-2 border-outline bg-surface font-mono text-xs text-foreground focus:border-primary focus:outline-none"
          >
            <option value="">All Statuses</option>
            {TICKET_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          <select
            value={priority}
            onChange={(e) => onPriorityChange(e.target.value)}
            aria-label="Filter by priority"
            className="px-3 py-2 border-2 border-outline bg-surface font-mono text-xs text-foreground focus:border-primary focus:outline-none"
          >
            <option value="">All Priorities</option>
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>

          <select
            value={category}
            onChange={(e) => onCategoryChange(e.target.value)}
            aria-label="Filter by category"
            className="px-3 py-2 border-2 border-outline bg-surface font-mono text-xs text-foreground focus:border-primary focus:outline-none"
          >
            <option value="">All Categories</option>
            {TICKET_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => onSlaBreachedChange(!slaBreachedOnly)}
            className={`px-3 py-2 border-2 font-mono text-xs font-medium flex items-center gap-1.5 transition-colors ${
              slaBreachedOnly
                ? "bg-destructive/15 border-destructive text-destructive"
                : "border-outline bg-surface text-muted-foreground hover:text-foreground"
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            SLA Breached
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/tickets/new">
            <Button className="flex items-center gap-1.5 font-mono">
              <Plus className="h-4 w-4" />
              New Ticket
            </Button>
          </Link>
        </div>
      </div>

      {/* Tickets Table */}
      <div className="border-2 border-outline bg-surface overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm font-mono text-muted-foreground">
            Loading tickets...
          </div>
        ) : tickets.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <p className="text-base font-semibold">No tickets found</p>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              {search || status || priority || category || slaBreachedOnly
                ? "Try clearing or modifying your filter criteria."
                : "Create your first support ticket to track customer issues and internal support requests."}
            </p>
            {!search && !status && !priority && !category && (
              <Link to="/tickets/new">
                <Button variant="outline" size="sm" className="mt-2 font-mono">
                  Create Ticket
                </Button>
              </Link>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-b-2 border-outline hover:bg-transparent font-mono text-xs">
                <TableHead className="w-[100px]">ID</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead className="w-[150px]">Status</TableHead>
                <TableHead className="w-[110px]">Priority</TableHead>
                <TableHead className="w-[130px]">Category</TableHead>
                <TableHead className="w-[160px]">Assignee</TableHead>
                <TableHead className="w-[80px] text-center">Replies</TableHead>
                <TableHead className="w-[140px] text-right">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tickets.map((ticket) => (
                <TableRow
                  key={ticket.id}
                  onClick={() => navigate(`/tickets/${ticket.id}`)}
                  className="cursor-pointer hover:bg-muted/40 transition-colors border-b border-outline/50"
                >
                  <TableCell className="font-mono text-xs font-bold text-primary">
                    #TKT-{ticket.number}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-foreground hover:underline">
                          {ticket.subject}
                        </span>
                        {ticket.slaBreached && <SlaBreachedBadge />}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {ticket.description}
                      </p>
                      {ticket.tags && ticket.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {ticket.tags.map((tag) => (
                            <span
                              key={tag}
                              className="px-1.5 py-0.2 rounded bg-muted text-[10px] font-mono text-muted-foreground"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <TicketStatusBadge status={ticket.status} />
                  </TableCell>
                  <TableCell>
                    <TicketPriorityBadge priority={ticket.priority} />
                  </TableCell>
                  <TableCell>
                    <TicketCategoryBadge category={ticket.category} />
                  </TableCell>
                  <TableCell>
                    {ticket.assignee ? (
                      <div className="flex items-center gap-1.5 text-xs">
                        <div className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold">
                          {ticket.assignee.displayName.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-mono truncate max-w-[120px]">
                          {ticket.assignee.displayName}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs font-mono text-muted-foreground italic">
                        Unassigned
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="inline-flex items-center gap-1 text-xs font-mono text-muted-foreground">
                      <MessageSquare className="h-3.5 w-3.5" />
                      {ticket.replyCount ?? 0}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground">
                    {formatDate(ticket.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between font-mono text-xs text-muted-foreground pt-2">
          <div>
            Showing page {page} of {totalPages} ({total} total tickets)
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1 || isLoading}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages || isLoading}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
