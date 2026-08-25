export interface Project {
  id: string;
  key: string;
  name: string;
  description: string | null;
  status: string;
  visibility: string;
  leadId: string | null;
  teamId: string | null;
  settings: Record<string, unknown>;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ProjectStats {
  total: number;
  open: number;
  closed: number;
  backlog: number;
}

export interface ProjectsResponse {
  projects: Project[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface Workflow {
  id: string;
  projectId: string;
  name: string;
  statuses: string[];
  transitions: Record<string, string[]>;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Label {
  id: string;
  projectId: string;
  name: string;
  color: string;
  createdAt: string;
}
