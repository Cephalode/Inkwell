export interface Deadline {
  id: string;
  title: string;
  courseId?: string;
  dueAt: number;
  source: 'manual' | 'course';
}
