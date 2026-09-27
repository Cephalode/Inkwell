export interface Course {
  id: string;
  name: string;
  description?: string;
  color?: string;
  courseraSlug?: string;
  /** The one course the learning roadmap is currently guiding the learner through. */
  isCurrent?: boolean;
  documentIds: string[];
  /** The folder in the documents tree this course auto-created. */
  folderId?: string;
  createdAt: number;
  updatedAt: number;
}
