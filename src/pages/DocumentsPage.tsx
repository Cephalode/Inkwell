import { useEffect, useCallback } from 'react';
import UploadZone from '../components/upload/UploadZone';
import FileList from '../components/upload/FileList';
import EmptyState from '../components/shared/EmptyState';
import Spinner from '../components/shared/Spinner';
import { useDocuments } from '../hooks/useDocuments';
import { useDocumentStore } from '../store/documentStore';
import { useNavigate } from 'react-router-dom';

export default function DocumentsPage() {
  const { documents, isLoading, classifyingIds, loadDocuments, uploadFile, deleteDocumentById } = useDocuments();
  const setCurrentDocument = useDocumentStore((s) => s.setCurrentDocument);
  const navigate = useNavigate();

  useEffect(() => { loadDocuments(); }, [loadDocuments]);

  const handleFilesSelected = useCallback(async (files: File[]) => {
    for (const file of files) {
      await uploadFile(file);
    }
  }, [uploadFile]);

  const handleSelectDoc = useCallback((doc: any) => {
    setCurrentDocument(doc);
    navigate(`/documents/${doc.id}`);
  }, [setCurrentDocument, navigate]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">📄 Documents</h1>
        <p className="text-slate-400">Upload and manage your study materials</p>
      </div>

      <UploadZone onFilesSelected={handleFilesSelected} isLoading={isLoading} />

      {isLoading && documents.length === 0 ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : documents.length === 0 ? (
        <EmptyState
          icon="📂"
          title="No documents yet"
          description="Upload your first study material to get started"
        />
      ) : (
        <FileList documents={documents} classifyingIds={classifyingIds} onDelete={deleteDocumentById} onSelect={handleSelectDoc} />
      )}
    </div>
  );
}
