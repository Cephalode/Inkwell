import { DocumentFile } from '../../types/document';
import FileCard from './FileCard';

interface FileListProps {
  documents: DocumentFile[];
  classifyingIds?: Set<string>;
  onDelete: (id: string) => void;
  onSelect: (doc: DocumentFile) => void;
}

export default function FileList({ documents, classifyingIds, onDelete, onSelect }: FileListProps) {
  if (documents.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {documents.map((doc) => (
        <FileCard key={doc.id} doc={doc} isClassifying={classifyingIds?.has(doc.id) ?? false} onDelete={onDelete} onSelect={onSelect} />
      ))}
    </div>
  );
}
