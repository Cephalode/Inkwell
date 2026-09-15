import { HiTrash, HiDocumentText } from 'react-icons/hi';
import Card from '../shared/Card';
import { Course } from '../../types/course';

interface CourseCardProps {
  course: Course;
  documentCount: number;
  onClick: (course: Course) => void;
  onDelete: (id: string) => void;
}

export default function CourseCard({ course, documentCount, onClick, onDelete }: CourseCardProps) {
  const colorStyle = course.color || 'var(--color-accent)';

  return (
    <Card onClick={() => onClick(course)} className="relative overflow-hidden">
      {/* Left color stripe */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ backgroundColor: colorStyle }}
      />
      <div className="flex items-start gap-4 pl-2">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm truncate">{course.name}</h4>
          {course.description && (
            <p className="text-xs mt-1 line-clamp-2" style={{ opacity: 0.6 }}>{course.description}</p>
          )}
          <div className="flex items-center gap-3 mt-2">
            <span className="inline-flex items-center gap-1 text-xs" style={{ opacity: 0.5 }}>
              <HiDocumentText className="w-3.5 h-3.5" />
              {documentCount} {documentCount === 1 ? 'document' : 'documents'}
            </span>
          </div>
          <p className="text-xs mt-1.5" style={{ opacity: 0.5 }}>
            {new Date(course.createdAt).toLocaleDateString()}
          </p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(course.id); }}
          className="p-1 transition-colors text-[var(--color-neutral-600)] hover:text-[var(--color-danger)]"
          aria-label="Delete course"
        >
          <HiTrash className="w-4 h-4" />
        </button>
      </div>
    </Card>
  );
}
