import type { Project } from "./project";
import type { User } from "./user";

export interface WorkItem {
  id: string;
  projectId: string;
  number: number;
  type: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assigneeId: string | null;
  reporterId: string;
  initiativeId: string | null;
  iterationId: string | null;
  parentId: string | null;
  storyPoints: number | null;
  dueDate: string | null;
  resolvedAt: string | null;
  metadata: Record<string, unknown>;
  position: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  project?: Project;
  assignee?: User;
  reporter?: User;
  initiative?: { id: string; name: string; projectId: string };
  iteration?: { id: string; name: string; projectId: string };
  labels?: Array<{ label: Label }>;
}

export interface Label {
  id: string;
  projectId: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface WorkItemLink {
  id: string;
  sourceId: string;
  targetId: string;
  linkType: string;
  source?: WorkItem;
  target?: WorkItem;
  createdAt: string;
}

export interface WorkItemsResponse {
  workItems: WorkItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface WorkItemComment {
  id: string;
  entityType: string;
  entityId: string;
  authorId: string;
  content: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  author?: User;
}

export interface WorkItemActivity {
  id: string;
  entityType: string;
  entityId: string;
  userId: string;
  action: string;
  changes: Record<string, unknown> | null;
  createdAt: string;
  user?: User;
}

export interface WorkItemBulkUpdate {
  ids: string[];
  status?: string;
  priority?: string;
  assigneeId?: string | null;
  iterationId?: string | null;
  initiativeId?: string | null;
  labelIds?: string[];
}
