export interface Initiative {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  status: string;
  progress: number;
  startDate: string | null;
  targetDate: string | null;
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

export interface InitiativesResponse {
  initiatives: Initiative[];
}
