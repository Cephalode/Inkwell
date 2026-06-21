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
  const colorStyle = course.color || '#06b6d4'; // fallback to cyan-500

  return (
    <Card onClick={() => onClick(course)} className="hover:scale-[1.02] transition-transform relative overflow-hidden">
      {/* Left color stripe */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
        style={{ backgroundColor: colorStyle }}
      />
      <div className="flex items-start gap-4 pl-2">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-slate-200 truncate">{course.name}</h4>
          {course.description && (
            <p className="text-xs text-slate-400 mt-1 line-clamp-2">{course.description}</p>
          )}
          <div className="flex items-center gap-3 mt-2">
            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
              <HiDocumentText className="w-3.5 h-3.5" />
              {documentCount} {documentCount === 1 ? 'document' : 'documents'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1.5">
            {new Date(course.createdAt).toLocaleDateString()}
          </p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(course.id); }}
          className="text-slate-500 hover:text-red-400 transition-colors p-1"
          aria-label="Delete course"
        >
          <HiTrash className="w-4 h-4" />
        </button>
      </div>
    </Card>
  );
}
