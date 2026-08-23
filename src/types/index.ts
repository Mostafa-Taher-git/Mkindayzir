import type { User } from "./user";

export type UserRole = "ADMIN" | "MANAGER" | "MEMBER" | "VIEWER";
export type ProjectStatus = "ACTIVE" | "ARCHIVED" | "COMPLETED";
export type WorkItemType = "TASK" | "BUG" | "FEATURE" | "IMPROVEMENT";
export type Priority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type Visibility = "PRIVATE" | "TEAM" | "PUBLIC";
export type NoteStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export type WorkItemStatus = "todo" | "in_progress" | "in_review" | "done" | "cancelled" | "blocked";
export type IterationStatus = "PLANNING" | "ACTIVE" | "COMPLETED" | "CANCELLED";
export type InitiativeStatus = "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export type SpaceRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

export type BoardSettings = {
  isStarred?: boolean;
  isArchived?: boolean;
  [key: string]: any;
};

export type CardMetadata = {
  isCompleted?: boolean;
  [key: string]: any;
};

export type WorkItemFilter = {
  projectId?: string;
  status?: string;
  assigneeId?: string;
  iterationId?: string;
  priority?: string;
  type?: string;
  search?: string;
  page?: number;
  perPage?: number;
};

export interface Space {
  id: string;
  name: string;
  description: string | null;
  visibility: Visibility;
  ownerId: string;
  boardCount: number;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Board {
  id: string;
  spaceId: string;
  name: string;
  description: string | null;
  background: string;
  settings: BoardSettings;
  columnOrder: string[];
  createdAt: string;
  updatedAt: string;
  space?: Space;
  columns?: BoardColumn[];
}

export interface BoardColumn {
  id: string;
  name: string;
  position: number;
  color: string | null;
  createdAt: string;
}

export interface BoardCard {
  id: string;
  boardId: string;
  columnId: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  coverImage: string | null;
  position: number;
  metadata: CardMetadata;
  createdAt: string;
  updatedAt: string;
  column?: BoardColumn;
  members?: CardMember[];
  labels?: CardLabel[];
  checklists?: Checklist[];
}

export interface CardMember {
  id: string;
  cardId: string;
  userId: string;
  role: SpaceRole;
  user?: User;
}

export interface CardLabel {
  id: string;
  cardId: string;
  labelId: string;
  label?: BoardLabel;
}

export interface BoardLabel {
  id: string;
  name: string;
  color: string;
}

export interface Checklist {
  id: string;
  cardId: string;
  title: string;
  position: number;
  items: ChecklistItem[];
  createdAt: string;
  updatedAt: string;
}

export interface ChecklistItem {
  id: string;
  checklistId: string;
  title: string;
  isCompleted: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface SpaceMember {
  id: string;
  spaceId: string;
  userId: string;
  role: SpaceRole;
  user?: User;
  createdAt: string;
}

export interface ActivityEntry {
  id: string;
  entityType: string;
  entityId: string;
  userId: string;
  action: string;
  changes: Record<string, unknown> | null;
  createdAt: string;
  user?: User;
}

export type VaultFolder = {
  id: string;
  parentId: string | null;
  name: string;
  path: string;
  position: number;
  createdAt: string;
  updatedAt: string;
  children?: VaultFolder[];
  notes?: VaultNote[];
};

export type VaultNote = {
  id: string;
  folderId: string | null;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  status: NoteStatus;
  authorId: string;
  version: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  author?: User;
  tags?: Tag[];
  outLinks?: InternalLink[];
  inLinks?: InternalLink[];
  versions?: NoteVersion[];
  feedback?: NoteFeedback[];
};

export type NoteVersion = {
  id: string;
  noteId: string;
  version: number;
  title: string;
  content: string;
  editedBy: string;
  createdAt: string;
};

export type Tag = {
  id: string;
  name: string;
  color: string | null;
};

export type InternalLink = {
  id: string;
  sourceId: string;
  targetId: string;
  context: string | null;
};

export type NoteFeedback = {
  id: string;
  noteId: string;
  userId: string;
  helpful: boolean;
  comment: string | null;
  createdAt: string;
};

export type GraphNode = {
  id: string;
  title: string;
  status: NoteStatus;
};

export type GraphLink = {
  source: string;
  target: string;
  context?: string;
};

export type VaultNoteFilter = {
  folderId?: string;
  status?: NoteStatus;
  authorId?: string;
  search?: string;
  tagId?: string;
  page?: number;
  perPage?: number;
};

export type MessageRole = "USER" | "ASSISTANT" | "SYSTEM" | "TOOL";

export type Conversation = {
  id: string;
  userId: string;
  title: string | null;
  model: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Message = {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  toolCalls?: Record<string, unknown>;
  toolResults?: Record<string, unknown>;
  model?: string | null;
  tokens?: number | null;
  createdAt: string;
};

export type ProviderType = "openrouter" | "openai" | "anthropic" | "custom";

export type AITool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type ProviderConfig = {
  provider: ProviderType;
  model: string;
  apiKey: string;
  customBaseUrl?: string;
};

export interface DashboardSummary {
  totalProjects: number;
  openWorkItems: number;
  assignedToMe: number;
  overdueItems: number;
}

export interface WorkloadAssignee {
  id: string;
  displayName: string;
  email: string;
}

export interface WorkloadItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  project: { key: string; name: string } | null;
}

export interface WorkloadGroup {
  assignee: WorkloadAssignee;
  items: WorkloadItem[];
  count: number;
}

export interface VelocityIteration {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

export interface VelocityGroup {
  iteration: VelocityIteration;
  totalPoints: number;
  count: number;
}

export interface TrendDay {
  date: string;
  created: number;
  resolved: number;
}

export type ReportType = "summary" | "workload" | "velocity" | "trends";

export interface Guide {
  id: string;
  title: string;
  slug: string;
  content: string;
  category: string;
  order: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface GuidesResponse {
  guides: Guide[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export type SearchResult = {
  type: "work_item" | "vault_note" | "guide";
  id: string;
  title: string;
  excerpt?: string;
  score: number;
};

export * from "./ticket";
