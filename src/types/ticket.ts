export interface Ticket {
  id: string;
  number: number;
  subject: string;
  description: string;
  status: string;
  priority: string;
  category: string | null;
  source: string;
  customerId: string | null;
  assigneeId: string | null;
  createdById: string;
  projectId: string | null;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  dueDate: string | null;
  slaBreached: boolean;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  assignee?: { id: string; displayName: string; email?: string; avatar?: string } | null;
  customer?: { id: string; displayName: string; email: string; company?: string | null; avatar?: string } | null;
  creator?: { id: string; displayName: string; email?: string; avatar?: string } | null;
  project?: { id: string; name: string; key: string } | null;
  replyCount?: number;
  replies?: TicketReply[];
}

export interface TicketReply {
  id: string;
  ticketId: string;
  authorId: string | null;
  customerId: string | null;
  content: string;
  isInternal: boolean;
  type: string;
  createdAt: string;
  updatedAt?: string | null;
  author?: { id: string; displayName: string; avatar?: string; email?: string } | null;
  customer?: { id: string; displayName: string; email: string; avatar?: string } | null;
}

export interface TicketsResponse {
  items: Ticket[];
  tickets: Ticket[];
  page?: number;
  perPage?: number;
  total?: number;
  totalPages?: number;
  pagination?: { page: number; limit: number; total: number; totalPages: number };
}

export interface TicketStats {
  totalCount: number;
  openCount: number;
  waitingCount: number;
  resolvedCount: number;
  closedCount: number;
  slaBreachedCount: number;
  urgentCount: number;
}
