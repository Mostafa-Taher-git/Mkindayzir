import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ticket, TicketReply } from "@/types/ticket";
import { TicketReplyForm } from "@/components/tickets/ticket-reply-form";
import { TicketSidebar } from "@/components/tickets/ticket-sidebar";
import {
  TicketStatusBadge,
  TicketPriorityBadge,
  TicketCategoryBadge,
  SlaBreachedBadge,
} from "@/components/tickets/ticket-status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { ROUTES } from "@/lib/constants";
import {
  ArrowLeft,
  MessageSquare,
  Lock,
  User,
  Clock,
  Calendar,
  AlertTriangle,
  Send,
  Loader2,
} from "lucide-react";
import { api } from "@/lib/api";

export default function TicketDetailPage() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const {
    data: ticket,
    isLoading,
    isError,
  } = useQuery<Ticket>({
    queryKey: ["ticket", ticketId],
    queryFn: async () => {
      if (!ticketId) throw new Error("No ticket ID");
      const res = await api.get<{ ticket: any }>(`/api/tickets/${ticketId}`);
      if (!res.ok) throw new Error("Ticket not found");
      return res.json();
    },
    enabled: Boolean(ticketId),
  });

  const handleUpdate = async (updatedFields: Partial<Ticket>) => {
    if (!ticketId) return;
    try {
      const res = await api.patch(`/api/tickets/${ticketId}`, updatedFields);
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["ticket", ticketId] });
        queryClient.invalidateQueries({ queryKey: ["tickets"] });
      }
    } catch (err) {
      console.error("Failed to update ticket", err);
    }
  };

  const handleClose = async () => {
    if (!ticketId) return;
    try {
      const res = await api.post(`/api/tickets/${ticketId}/close`);
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["ticket", ticketId] });
        queryClient.invalidateQueries({ queryKey: ["tickets"] });
      }
    } catch (err) {
      console.error("Failed to close ticket", err);
    }
  };

  const handleReopen = async () => {
    if (!ticketId) return;
    try {
      const res = await api.post(`/api/tickets/${ticketId}/reopen`);
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["ticket", ticketId] });
        queryClient.invalidateQueries({ queryKey: ["tickets"] });
      }
    } catch (err) {
      console.error("Failed to reopen ticket", err);
    }
  };

  const handleDelete = async () => {
    if (!ticketId) return;
    if (!window.confirm("Are you sure you want to delete this ticket?")) return;
    try {
      const res = await api.delete(`/api/tickets/${ticketId}`);
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["tickets"] });
        navigate(ROUTES.TICKETS);
      }
    } catch (err) {
      console.error("Failed to delete ticket", err);
    }
  };

  const handleReplyAdded = (newReply: TicketReply) => {
    queryClient.invalidateQueries({ queryKey: ["ticket", ticketId] });
    queryClient.invalidateQueries({ queryKey: ["tickets"] });
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return "-";
    const date = new Date(isoString);
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center font-mono text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading ticket details...
      </div>
    );
  }

  if (isError || !ticket) {
    return (
      <div className="p-8 text-center space-y-4 max-w-md mx-auto">
        <p className="text-destructive font-mono font-medium">Ticket not found or deleted.</p>
        <Link to={ROUTES.TICKETS}>
          <Button variant="outline" size="sm" className="font-mono">
            Back to Tickets
          </Button>
        </Link>
      </div>
    );
  }

  const replies = ticket.replies || [];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto animate-power-on">
      {/* Back Link */}
      <div className="flex items-center justify-between">
        <Link
          to={ROUTES.TICKETS}
          className="inline-flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Tickets
        </Link>
      </div>

      {/* Ticket Header Banner */}
      <div className="border-2 border-outline bg-surface p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-bold text-primary">
            #TKT-{ticket.number}
          </span>
          <TicketStatusBadge status={ticket.status} />
          <TicketPriorityBadge priority={ticket.priority} />
          <TicketCategoryBadge category={ticket.category} />
          {ticket.slaBreached && <SlaBreachedBadge />}
        </div>

        <h1 className="text-2xl font-bold font-mono text-foreground">{ticket.subject}</h1>

        {ticket.tags && ticket.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {ticket.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 rounded bg-muted text-xs font-mono text-muted-foreground border border-border"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Column: Description + Thread + Reply Composer */}
        <div className="lg:col-span-2 space-y-6">
          {/* Initial Ticket Description */}
          <div className="border-2 border-outline bg-surface p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-outline pb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-primary/20 text-primary flex items-center justify-center font-mono font-bold text-xs">
                  {(ticket.customer?.displayName || ticket.creator?.displayName || "U")
                    .charAt(0)
                    .toUpperCase()}
                </div>
                <div>
                  <p className="text-xs font-mono font-semibold">
                    {ticket.customer?.displayName || ticket.creator?.displayName || "Creator"}
                  </p>
                  <p className="text-[10px] font-mono text-muted-foreground">
                    Opened ticket • {formatDate(ticket.createdAt)}
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-mono uppercase bg-muted px-2 py-0.5 text-muted-foreground border">
                Initial Issue
              </span>
            </div>

            <div className="text-sm font-mono whitespace-pre-wrap leading-relaxed">
              {ticket.description}
            </div>
          </div>

          {/* Conversation Thread */}
          {replies.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Conversation & Notes ({replies.length})
              </h2>

              <div className="space-y-3">
                {replies.map((reply) => {
                  const isNote = reply.isInternal;
                  const authorName =
                    reply.author?.displayName || reply.customer?.displayName || "Staff";
                  const initial = authorName.charAt(0).toUpperCase();

                  return (
                    <div
                      key={reply.id}
                      className={`border-2 p-4 space-y-3 transition-colors ${
                        isNote
                          ? "border-amber-500/50 bg-amber-500/5 dark:bg-amber-500/10"
                          : "border-outline bg-surface"
                      }`}
                    >
                      <div className="flex items-center justify-between border-b border-outline/50 pb-2">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-6 h-6 rounded-full flex items-center justify-center font-mono font-bold text-[10px] ${
                              isNote
                                ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                                : "bg-primary/20 text-primary"
                            }`}
                          >
                            {initial}
                          </div>
                          <div>
                            <span className="text-xs font-mono font-bold mr-2">
                              {authorName}
                            </span>
                            <span className="text-[10px] font-mono text-muted-foreground">
                              {formatDate(reply.createdAt)}
                            </span>
                          </div>
                        </div>

                        {isNote && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-amber-600 dark:text-amber-400 bg-amber-500/15 px-2 py-0.5 border border-amber-500/30 rounded">
                            <Lock className="h-2.5 w-2.5" />
                            INTERNAL NOTE
                          </span>
                        )}
                      </div>

                      <div className="text-sm font-mono whitespace-pre-wrap leading-relaxed pl-1">
                        {reply.content}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Reply Composer */}
          <div className="border-2 border-outline bg-surface p-5 space-y-3">
            <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Send className="h-4 w-4" />
              Add Reply or Internal Note
            </h2>
            <TicketReplyForm ticketId={ticket.id} onReplyAdded={handleReplyAdded} />
          </div>
        </div>

        {/* Right Column: Ticket Properties Sidebar */}
        <div className="lg:col-span-1">
          <TicketSidebar
            ticket={ticket}
            currentUserId={user?.id}
            onUpdate={handleUpdate}
            onClose={handleClose}
            onReopen={handleReopen}
            onDelete={handleDelete}
          />
        </div>
      </div>
    </div>
  );
}