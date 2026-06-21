export interface Course {
  id: string;
  name: string;
  description?: string;
  color?: string;
  documentIds: string[];
  createdAt: number;
  updatedAt: number;
}
