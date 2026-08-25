export interface Iteration {
  id: string;
  projectId: string;
  name: string;
  goal: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
  project?: {
    id: string;
    key: string;
    name: string;
  };
  workItems?: Array<{
    id: string;
    title: string;
    type: string;
    status: string;
    priority: string;
  }>;
}

export interface IterationStats {
  total: number;
  completed: number;
  points: number;
  progress: number;
}

export interface IterationsResponse {
  iterations: Iteration[];
}
