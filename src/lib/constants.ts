export const APP_NAME = "Mkindayzir";
export const APP_TAGLINE = "Your Operations, Your Server, Your Control.";

export const ROUTES = {
  HOME: "/",
  LOGIN: "/login",
  REGISTER: "/register",
  FORGOT_PASSWORD: "/forgot-password",
  DASHBOARD: "/dashboard",
  PROJECTS: "/projects",
  SPACES: "/spaces",
  BOARDS: "/boards",
  VAULT: "/vault",
  ASSISTANT: "/assistant",
  GUIDES: "/guides",
  REPORTS: "/reports",
  ADMIN: "/admin",
  SETTINGS: "/settings",
  SETTINGS_SYSTEM: "/settings/system",
  TICKETS: "/tickets",
  ROADMAP: "/roadmap",
} as const;

export const TICKET_STATUSES = [
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "WAITING_ON_CUSTOMER", label: "Waiting on Customer" },
  { value: "WAITING_ON_TEAM", label: "Waiting on Team" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CLOSED", label: "Closed" },
] as const;

export const TICKET_CATEGORIES = [
  { value: "GENERAL", label: "General" },
  { value: "BILLING", label: "Billing" },
  { value: "TECHNICAL", label: "Technical" },
  { value: "FEATURE_REQUEST", label: "Feature Request" },
  { value: "BUG_REPORT", label: "Bug Report" },
] as const;

export const TICKET_SOURCES = [
  { value: "INTERNAL", label: "Internal" },
  { value: "PORTAL", label: "Portal" },
  { value: "EMAIL", label: "Email" },
  { value: "API", label: "API" },
] as const;

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

export const SPACE_ROLES = [
  { value: "OWNER", label: "Owner" },
  { value: "ADMIN", label: "Admin" },
  { value: "MEMBER", label: "Member" },
  { value: "VIEWER", label: "Viewer" },
] as const;

export const BOARD_BACKGROUNDS = [
  { value: "#ffffff", label: "White" },
  { value: "#f3f4f6", label: "Light Gray" },
  { value: "#1f2937", label: "Dark" },
  { value: "#0ea5e9", label: "Sky Blue" },
  { value: "#10b981", label: "Emerald" },
  { value: "#f59e0b", label: "Amber" },
  { value: "#ef4444", label: "Red" },
  { value: "#8b5cf6", label: "Violet" },
] as const;

export const VIEW_MODES = [
  { value: "kanban", label: "Kanban" },
  { value: "table", label: "Table" },
] as const;

export const NOTE_STATUSES = [
  { value: "DRAFT", label: "Draft" },
  { value: "PUBLISHED", label: "Published" },
  { value: "ARCHIVED", label: "Archived" },
] as const;

export const VAULT_ROUTES = {
  HOME: "/vault",
  FOLDERS: "/vault/folders",
  NOTES: "/vault/notes",
  NEW_NOTE: "/vault/notes/new",
  GRAPH: "/vault/graph",
  TAGS: "/vault/tags",
} as const;
