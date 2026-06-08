import { useEffect, useCallback, useState, useMemo, lazy, Suspense } from 'react';
import UploadZone from '../components/upload/UploadZone';
import FileList from '../components/upload/FileList';
import EmptyState from '../components/shared/EmptyState';
import Spinner from '../components/shared/Spinner';

// Lazy-load GraphViewer to avoid eagerly importing react-force-graph,
// which references AFRAME (A-Frame) at module level and crashes if not installed.
const GraphViewer = lazy(() => import('../components/knowledgeGraph/GraphViewer'));
import { GraphFilters } from '../components/knowledgeGraph/GraphFilters';
import { NodeDetailPanel } from '../components/knowledgeGraph/NodeDetailPanel';
import { GraphStats } from '../components/knowledgeGraph/GraphStats';
import { GraphControls } from '../components/knowledgeGraph/GraphControls';
import { useDocuments } from '../hooks/useDocuments';
import { useCourses } from '../hooks/useCourses';
import { useDocumentStore } from '../store/documentStore';
import { useChatStore } from '../store/chatStore';
import { useKnowledgeGraphStore } from '../store/knowledgeGraphStore';
import { updateDocumentTags, listChapters } from '../services/api/client';
import { buildKnowledgeGraph } from '../utils/buildKnowledgeGraph';

import { useNavigate } from 'react-router-dom';
import { HiOutlineListBullet, HiOutlineShare } from 'react-icons/hi2';
import type { KGNode } from '../types/knowledgeGraph';
import type { ChapterDocument } from '../types/document';

export default function DocumentsPage() {
  const { documents, isLoading, loadDocuments, uploadFile, deleteDocumentById } = useDocuments();
  const updateDocument = useDocumentStore((s) => s.updateDocument);
  const setCurrentDocument = useDocumentStore((s) => s.setCurrentDocument);
  const { courses, loadCourses, addDocumentToCourse } = useCourses();
  const sessions = useChatStore((s) => s.sessions) ?? [];
  const setSelectedNode = useKnowledgeGraphStore((s) => s.setSelectedNode);
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<'list' | 'graph'>('list');
  const [chapters, setChapters] = useState<ChapterDocument[]>([]);

  useEffect(() => { loadDocuments(); loadCourses(); }, [loadDocuments, loadCourses]);

  // Fetch chapters from backend API for each document
  useEffect(() => {
    if (documents.length === 0) {
      setChapters([]);
      return;
    }
    let cancelled = false;
    Promise.all(documents.map(doc => listChapters(doc.id)))
      .then(results => {
        if (!cancelled) setChapters(results.flat());
      })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [documents]);

  const handleFilesSelected = useCallback(async (files: File[]) => {
    for (const file of files) {
      await uploadFile(file);
    }
  }, [uploadFile]);

  const handleSelectDoc = useCallback((doc: any) => {
    setCurrentDocument(doc);
    navigate(`/documents/${doc.id}`);
  }, [setCurrentDocument, navigate]);

  const handleMoveToCourse = useCallback(async (docId: string, courseId: string) => {
    await addDocumentToCourse(courseId, docId);
  }, [addDocumentToCourse]);

  const handleUpdateTags = useCallback(async (docId: string, tags: string[]) => {
    await updateDocumentTags(docId, tags);
    updateDocument(docId, { tags });
  }, [updateDocument]);

  const graph = useMemo(
    () => buildKnowledgeGraph(documents, courses, sessions, chapters),
    [documents, courses, sessions, chapters],
  );

  const handleGraphNodeClick = useCallback(
    (node: KGNode) => {
      setSelectedNode(node);
    },
    [setSelectedNode],
  );

  const handleOpenDocument = useCallback(
    (nodeId: string) => {
      const docNode = graph.nodes.find((n) => n.id === nodeId);
      if (docNode?.parentId) {
        navigate(`/documents/${docNode.parentId}`);
      }
    },
    [graph.nodes, navigate],
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">📄 Documents</h1>
          <p className="text-slate-400">Upload and manage your study materials</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-400">
            {documents.length} document{documents.length !== 1 ? 's' : ''}
          </span>
          {/* View toggle */}
          <div className="flex items-center rounded-lg bg-slate-800 p-0.5">
            <button
              onClick={() => setViewMode('list')}
              className={
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ' +
                (viewMode === 'list'
                  ? 'bg-teal-600 text-white'
                  : 'text-slate-400 hover:text-white')
              }
              title="List view"
            >
              <HiOutlineListBullet className="h-4 w-4" />
              <span className="hidden sm:inline">List</span>
            </button>
            <button
              onClick={() => setViewMode('graph')}
              className={
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ' +
                (viewMode === 'graph'
                  ? 'bg-teal-600 text-white'
                  : 'text-slate-400 hover:text-white')
              }
              title="Graph view"
            >
              <HiOutlineShare className="h-4 w-4" />
              <span className="hidden sm:inline">Graph</span>
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'list' && (
        <UploadZone onFilesSelected={handleFilesSelected} isLoading={isLoading} />
      )}

      {isLoading && documents.length === 0 ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : viewMode === 'graph' ? (
        <div className="relative rounded-xl border border-slate-700/50 bg-slate-900/50 overflow-hidden h-[calc(100vh-12rem)]">
          {graph.nodes.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <EmptyState
                icon="🔗"
                title="No graph data yet"
                description="Upload documents to see their relationships"
              />
            </div>
          ) : (
            <>
              {/* Filters overlay — left side */}
              <GraphFilters />

              {/* Physics Controls overlay — bottom-left */}
              <GraphControls />

              {/* Graph Viewer — fills the container */}
              <Suspense
                fallback={
                  <div className="flex items-center justify-center h-full">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-10 h-10 rounded-full border-3 border-slate-700 border-t-teal-400 animate-spin" />
                      <p className="text-sm text-slate-500">Loading graph…</p>
                    </div>
                  </div>
                }
              >
                <GraphViewer graph={graph} onNodeClick={handleGraphNodeClick} />
              </Suspense>

              {/* Node Detail Panel — right side, slides in */}
              <NodeDetailPanel graph={graph} onOpenDocument={handleOpenDocument} />

              {/* Stats Bar — bottom overlay */}
              <GraphStats graph={graph} />
            </>
          )}
        </div>
      ) : documents.length === 0 ? (
        <EmptyState
          icon="📂"
          title="No documents yet"
          description="Upload your first study material to get started"
        />
      ) : (
        <FileList
          documents={documents}
          onDelete={deleteDocumentById}
          onSelect={handleSelectDoc}
          courses={courses.map(c => ({ id: c.id, name: c.name, documentIds: c.documentIds }))}
          onMoveToCourse={handleMoveToCourse}
          onUpdateTags={handleUpdateTags}
        />
      )}
    </div>
  );
}
