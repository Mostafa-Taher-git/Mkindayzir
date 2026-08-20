export type UserRole = "ADMIN" | "MANAGER" | "MEMBER" | "VIEWER";
export type ProjectStatus = "ACTIVE" | "ARCHIVED" | "COMPLETED";
export type WorkItemType = "TASK" | "BUG" | "FEATURE" | "IMPROVEMENT";
export type Priority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type Visibility = "PRIVATE" | "TEAM" | "PUBLIC";
export type NoteStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export type WorkItemStatus = "todo" | "in_progress" | "in_review" | "done" | "cancelled" | "blocked";
export type IterationStatus = "PLANNING" | "ACTIVE" | "COMPLETED" | "CANCELLED";
export type InitiativeStatus = "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

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
