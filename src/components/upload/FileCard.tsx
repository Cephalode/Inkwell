import { HiTrash, HiDocumentText, HiAcademicCap } from 'react-icons/hi';
import Card from '../shared/Card';
import Badge from '../shared/Badge';
import { DocumentFile } from '../../types/document';
import { formatFileSize, getFileIcon } from '../../utils/fileHelpers';

const CATEGORY_COLORS: Record<string, BadgeProps['color']> = {
  Textbook: 'cyan',
  Worksheet: 'yellow',
  Exam: 'red',
  Quiz: 'red',
  Notes: 'green',
  Slides: 'purple',
  Reference: 'gray',
  Article: 'teal',
  Paper: 'teal',
  'Lab Manual': 'teal',
  Syllabus: 'purple',
  'Study Guide': 'cyan',
  Handout: 'gray',
  Diagram: 'teal',
  Code: 'green',
};

interface FileCardProps {
  doc: DocumentFile;
  isClassifying?: boolean;
  onDelete: (id: string) => void;
  onSelect: (doc: DocumentFile) => void;
}

type BadgeProps = React.ComponentProps<typeof Badge>;

export default function FileCard({ doc, isClassifying, onDelete, onSelect }: FileCardProps) {
  const [category] = doc.tags;
  const badgeColor = category && CATEGORY_COLORS[category] ? CATEGORY_COLORS[category] : 'gray';

  return (
    <Card onClick={() => onSelect(doc)} className="hover:scale-[1.02] transition-transform">
      <div className="flex items-start gap-2 sm:gap-4">
        <div className="text-2xl sm:text-3xl">{getFileIcon(doc.type)}</div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-slate-200 truncate">{doc.name}</h4>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {category ? (
              <>
                {doc.tags.map((tag) => (
                  <Badge key={tag} color={badgeColor}>{tag}</Badge>
                ))}
              </>
            ) : isClassifying ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border bg-yellow-500/20 text-yellow-300 border-yellow-500/30 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-bounce" />
                Classifying…
              </span>
            ) : (
              <Badge color="gray">{doc.type.toUpperCase()}</Badge>
            )}
            <span className="text-xs text-slate-500">{formatFileSize(doc.size)}</span>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {new Date(doc.createdAt).toLocaleDateString()}
          </p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(doc.id); }}
          className="text-slate-500 hover:text-red-400 transition-colors p-1"
        >
          <HiTrash className="w-4 h-4" />
        </button>
      </div>
    </Card>
  );
}
