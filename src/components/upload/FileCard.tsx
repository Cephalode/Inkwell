import { HiTrash, HiChat, HiDocumentText, HiAcademicCap } from 'react-icons/hi';
import Card from '../shared/Card';
import Badge from '../shared/Badge';
import { DocumentFile } from '../../types/document';
import { formatFileSize, getFileIcon } from '../../utils/fileHelpers';

interface FileCardProps {
  doc: DocumentFile;
  onDelete: (id: string) => void;
  onSelect: (doc: DocumentFile) => void;
}

export default function FileCard({ doc, onDelete, onSelect }: FileCardProps) {
  return (
    <Card onClick={() => onSelect(doc)} className="hover:scale-[1.02] transition-transform">
      <div className="flex items-start gap-4">
        <div className="text-3xl">{getFileIcon(doc.type)}</div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-slate-200 truncate">{doc.name}</h4>
          <div className="flex items-center gap-2 mt-1">
            <Badge color="gray">{doc.type.toUpperCase()}</Badge>
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
