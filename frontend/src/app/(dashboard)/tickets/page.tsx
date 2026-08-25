import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TicketList } from "@/components/tickets/ticket-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TicketsResponse, TicketStats } from "@/types/ticket";
import { Clock, AlertTriangle, CheckCircle2, MessageSquare, Ticket as TicketIcon } from "lucide-react";

export default function TicketsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [category, setCategory] = useState("");
  const [slaBreachedOnly, setSlaBreachedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const perPage = 15;

  // Fetch Tickets
  const { data: ticketsData, isLoading: ticketsLoading } = useQuery<TicketsResponse>({
    queryKey: ["tickets", { search, status, priority, category, slaBreachedOnly, page }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.append("search", search);
      if (status) params.append("status", status);
      if (priority) params.append("priority", priority);
      if (category) params.append("category", category);
      if (slaBreachedOnly) params.append("slaBreached", "true");
      params.append("page", String(page));
      params.append("perPage", String(perPage));

      const res = await fetch(`/api/tickets?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch tickets");
      return res.json();
    },
  });

  // Fetch Ticket Stats
  const { data: statsData } = useQuery<TicketStats>({
    queryKey: ["tickets", "stats"],
    queryFn: async () => {
      const res = await fetch("/api/tickets/stats", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch ticket stats");
      return res.json();
    },
  });

  const stats = statsData || {
    totalCount: 0,
    openCount: 0,
    waitingCount: 0,
    resolvedCount: 0,
    closedCount: 0,
    slaBreachedCount: 0,
    urgentCount: 0,
  };

  const tickets = ticketsData?.items || ticketsData?.tickets || [];
  const total = ticketsData?.total || ticketsData?.pagination?.total || 0;
  const totalPages = ticketsData?.totalPages || ticketsData?.pagination?.totalPages || 1;

  const statCards = [
    {
      title: "Open Tickets",
      value: stats.openCount,
      description: "Active requests",
      icon: Clock,
      className: "border-blue-500/30 text-blue-600 dark:text-blue-400",
    },
    {
      title: "Awaiting Response",
      value: stats.waitingCount,
      description: "Customer or team action",
      icon: MessageSquare,
      className: "border-purple-500/30 text-purple-600 dark:text-purple-400",
    },
    {
      title: "SLA Breached",
      value: stats.slaBreachedCount,
      description: "Needs immediate attention",
      icon: AlertTriangle,
      critical: stats.slaBreachedCount > 0,
      className: stats.slaBreachedCount > 0 ? "border-destructive/40 text-destructive" : "",
    },
    {
      title: "Resolved / Closed",
      value: stats.resolvedCount + stats.closedCount,
      description: "Successfully handled",
      icon: CheckCircle2,
      className: "border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
    },
  ];

  return (
    <div className="p-6 space-y-6 animate-power-on max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <TicketIcon className="h-7 w-7 text-primary" />
            <h1 className="text-3xl font-bold font-mono">Tickets</h1>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            Support helpdesk & customer request management console.
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((st) => {
          const Icon = st.icon;
          return (
            <Card key={st.title} className={st.className}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-mono font-medium uppercase tracking-wider text-muted-foreground">
                  {st.title}
                </CardTitle>
                <Icon className="h-4 w-4 opacity-75" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-mono">{st.value}</div>
                <p className="text-xs text-muted-foreground mt-1">{st.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tickets List */}
      <TicketList
        tickets={tickets}
        isLoading={ticketsLoading}
        page={page}
        totalPages={totalPages}
        total={total}
        search={search}
        status={status}
        priority={priority}
        category={category}
        slaBreachedOnly={slaBreachedOnly}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
        }}
        onStatusChange={(val) => {
          setStatus(val);
          setPage(1);
        }}
        onPriorityChange={(val) => {
          setPriority(val);
          setPage(1);
        }}
        onCategoryChange={(val) => {
          setCategory(val);
          setPage(1);
        }}
        onSlaBreachedChange={(val) => {
          setSlaBreachedOnly(val);
          setPage(1);
        }}
        onPageChange={setPage}
      />
    </div>
  );
}
