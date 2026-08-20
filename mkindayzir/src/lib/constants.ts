export const APP_NAME = "Mkindayzir";
export const APP_TAGLINE = "Your Operations, Your Server, Your Control.";

export const ROUTES = {
  HOME: "/",
  LOGIN: "/login",
  REGISTER: "/register",
  FORGOT_PASSWORD: "/forgot-password",
  DASHBOARD: "/dashboard",
  PROJECTS: "/dashboard/projects",
  BOARDS: "/dashboard/boards",
  VAULT: "/dashboard/vault",
  ASSISTANT: "/dashboard/assistant",
  GUIDES: "/dashboard/guides",
  REPORTS: "/dashboard/reports",
  ADMIN: "/dashboard/admin",
  SETTINGS: "/dashboard/settings",
} as const;

export const PROJECT_STATUSES = [
  { value: "ACTIVE", label: "Active" },
  { value: "ARCHIVED", label: "Archived" },
  { value: "COMPLETED", label: "Completed" },
] as const;

export const WORK_ITEM_TYPES = [
  { value: "TASK", label: "Task" },
  { value: "BUG", label: "Bug" },
  { value: "FEATURE", label: "Feature" },
  { value: "IMPROVEMENT", label: "Improvement" },
] as const;

export const PRIORITIES = [
  { value: "CRITICAL", label: "Critical" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
] as const;

export const WORK_ITEM_STATUSES = [
  { value: "BACKLOG", label: "Backlog" },
  { value: "TODO", label: "To Do" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "IN_REVIEW", label: "In Review" },
  { value: "DONE", label: "Done" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;

export const ITERATION_STATUSES = [
  { value: "PLANNING", label: "Planning" },
  { value: "ACTIVE", label: "Active" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;

export const INITIATIVE_STATUSES = [
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;

export const VISIBILITIES = [
  { value: "PRIVATE", label: "Private" },
  { value: "TEAM", label: "Team" },
  { value: "PUBLIC", label: "Public" },
] as const;
