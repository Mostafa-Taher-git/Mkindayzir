// src/config/defaults.ts
export const DEFAULT_WORKFLOW = {
  name: "Default Workflow",
  statuses: [
    { id: "todo", name: "To Do", category: "todo", color: "#6b7280" },
    { id: "in_progress", name: "In Progress", category: "in_progress", color: "#3b82f6" },
    { id: "done", name: "Done", category: "done", color: "#10b981" },
  ],
  transitions: [
    { from: "todo", to: "in_progress" },
    { from: "in_progress", to: "done" },
    { from: "done", to: "todo" },
    { from: "todo", to: "done" },
  ],
};

export const DEFAULT_BOARD_TEMPLATES = [
  {
    name: "Basic",
    columns: [
      { name: "To Do", position: 0 },
      { name: "In Progress", position: 1 },
      { name: "Done", position: 2 },
    ],
  },
  {
    name: "Development",
    columns: [
      { name: "Backlog", position: 0 },
      { name: "Ready", position: 1 },
      { name: "In Progress", position: 2 },
      { name: "Review", position: 3 },
      { name: "Done", position: 4 },
    ],
  },
  {
    name: "Marketing",
    columns: [
      { name: "Ideas", position: 0 },
      { name: "Planning", position: 1 },
      { name: "In Progress", position: 2 },
      { name: "Published", position: 3 },
    ],
  },
];
