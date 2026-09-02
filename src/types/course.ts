export interface Course {
  id: string;
  name: string;
  description?: string;
  color?: string;
  courseraSlug?: string;
  documentIds: string[];
  createdAt: number;
  updatedAt: number;
}
