import { DocumentFile } from '../../types/document';
import FileCard from './FileCard';

interface FileListProps {
  documents: DocumentFile[];
  onDelete: (id: string) => void;
  onSelect: (doc: DocumentFile) => void;
  courses: Array<{ id: string; name: string; documentIds: string[] }>;
  onMoveToCourse: (docId: string, courseId: string) => void;
  onUpdateTags: (docId: string, tags: string[]) => void;
}

export default function FileList({ documents, onDelete, onSelect, courses, onMoveToCourse, onUpdateTags }: FileListProps) {
  if (documents.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {documents.map((doc) => (
        <FileCard
          key={doc.id}
          doc={doc}
          isClassifying={doc.classifyStatus === 'classifying' || doc.classifyStatus === 'pending'}
          onDelete={onDelete}
          onSelect={onSelect}
          courses={courses}
          onMoveToCourse={onMoveToCourse}
          onUpdateTags={onUpdateTags}
        />
      ))}
    </div>
  );
}
