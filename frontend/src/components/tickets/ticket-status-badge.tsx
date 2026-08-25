import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AlertCircle, Clock, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function TicketStatusBadge({ status, className }: StatusBadgeProps) {
  const getStatusConfig = (s: string) => {
    switch (s?.toUpperCase()) {
      case "OPEN":
        return {
          label: "Open",
          variant: "default" as const,
          className: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
          icon: Clock,
        };
      case "IN_PROGRESS":
        return {
          label: "In Progress",
          variant: "default" as const,
          className: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
          icon: Clock,
        };
      case "WAITING_ON_CUSTOMER":
        return {
          label: "Waiting on Customer",
          variant: "default" as const,
          className: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30",
          icon: Clock,
        };
      case "WAITING_ON_TEAM":
        return {
          label: "Waiting on Team",
          variant: "default" as const,
          className: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30",
          icon: AlertCircle,
        };
      case "RESOLVED":
        return {
          label: "Resolved",
          variant: "default" as const,
          className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
          icon: CheckCircle2,
        };
      case "CLOSED":
        return {
          label: "Closed",
          variant: "secondary" as const,
          className: "bg-muted text-muted-foreground border-border",
          icon: XCircle,
        };
      default:
        return {
          label: s,
          variant: "outline" as const,
          className: "",
          icon: Clock,
        };
    }
  };

  const config = getStatusConfig(status);
  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border font-mono tracking-tight",
        config.className,
        className
      )}
    >
      <Icon className="h-3 w-3 shrink-0" />
      {config.label}
    </span>
  );
}

interface PriorityBadgeProps {
  priority: string;
  className?: string;
}

export function TicketPriorityBadge({ priority, className }: PriorityBadgeProps) {
  const getPriorityConfig = (p: string) => {
    switch (p?.toUpperCase()) {
      case "CRITICAL":
        return {
          label: "Critical",
          className: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30 font-bold",
          icon: AlertTriangle,
        };
      case "HIGH":
        return {
          label: "High",
          className: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30",
          icon: AlertCircle,
        };
      case "MEDIUM":
        return {
          label: "Medium",
          className: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30",
          icon: Clock,
        };
      case "LOW":
        return {
          label: "Low",
          className: "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30",
          icon: Clock,
        };
      default:
        return {
          label: p,
          className: "bg-muted text-muted-foreground border-border",
          icon: Clock,
        };
    }
  };

  const config = getPriorityConfig(priority);
  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-medium border",
        config.className,
        className
      )}
    >
      <Icon className="h-3 w-3 shrink-0" />
      {config.label}
    </span>
  );
}

export function TicketCategoryBadge({ category }: { category: string | null }) {
  if (!category) return null;
  const label = category.replace(/_/g, " ");
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded bg-muted/60 text-muted-foreground text-xs font-mono border border-border/50 uppercase text-[10px] tracking-wider">
      {label}
    </span>
  );
}

export function SlaBreachedBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-destructive/15 text-destructive text-xs font-mono font-semibold border border-destructive/40 animate-pulse">
      <AlertTriangle className="h-3 w-3 shrink-0" />
      SLA BREACHED
    </span>
  );
}
