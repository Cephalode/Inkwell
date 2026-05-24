import { useCallback } from 'react';
import { useDocumentStore } from '../store/documentStore';
import { parseFile } from '../services/parsers/index';
import { saveDocument, getAllDocuments, deleteDocument as deleteDoc } from '../services/storage/documentStore';
import type { DocumentFile, DocumentType } from '../types/document';
import { SUPPORTED_MIME_TYPES, SUPPORTED_EXTENSIONS } from '../types/document';

export function useDocuments() {
  const { documents, setDocuments, addDocument, removeDocument, setLoading, isLoading } = useDocumentStore();

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const docs = await getAllDocuments();
      setDocuments(docs);
    } finally {
      setLoading(false);
    }
  }, [setDocuments, setLoading]);

  const uploadFile = useCallback(async (file: File) => {
    setLoading(true);
    try {
      const parsed = await parseFile(file);
      const docType = getDocType(file);
      const doc: DocumentFile = {
        id: crypto.randomUUID(),
        name: file.name,
        type: docType,
        mimeType: file.type,
        size: file.size,
        rawBlob: file,
        parsedText: parsed.text,
        parsedPages: parsed.pages,
        chapterMarkers: parsed.chapters,
        thumbnail: parsed.thumbnail,
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await saveDocument(doc);
      addDocument(doc);
      return doc;
    } finally {
      setLoading(false);
    }
  }, [addDocument, setLoading]);

  const deleteDocumentById = useCallback(async (id: string) => {
    await deleteDoc(id);
    removeDocument(id);
  }, [removeDocument]);

  return { documents, isLoading, loadDocuments, uploadFile, deleteDocumentById };
}

function getDocType(file: File): DocumentType {
  if (SUPPORTED_MIME_TYPES[file.type]) return SUPPORTED_MIME_TYPES[file.type];
  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  if (ext && SUPPORTED_EXTENSIONS[ext]) return SUPPORTED_EXTENSIONS[ext];
  return 'txt';
}
