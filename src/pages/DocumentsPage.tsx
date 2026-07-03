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
import { updateDocumentTags, listChapters, listTextbooks, deleteTextbook } from '../services/api/client';
import { buildKnowledgeGraph } from '../utils/buildKnowledgeGraph';

import { useNavigate } from 'react-router-dom';
import { HiOutlineShare, HiChevronDown, HiChevronRight, HiBookOpen, HiTrash, HiExclamationCircle } from 'react-icons/hi';
import { HiOutlineListBullet } from 'react-icons/hi2';
import type { KGNode } from '../types/knowledgeGraph';
import type { ChapterDocument, Textbook, DocumentFile } from '../types/document';

export default function DocumentsPage() {
  const { documents, isLoading, loadDocuments, uploadFile, uploadVideoUrl, deleteDocumentById } = useDocuments();
  const updateDocument = useDocumentStore((s) => s.updateDocument);
  const setCurrentDocument = useDocumentStore((s) => s.setCurrentDocument);
  const { courses, loadCourses, addDocumentToCourse } = useCourses();
  const sessions = useChatStore((s) => s.sessions);
  const safeSessions = useMemo(() => sessions ?? [], [sessions]);
  const setSelectedNode = useKnowledgeGraphStore((s) => s.setSelectedNode);
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<'list' | 'graph'>('list');
  const [chapters, setChapters] = useState<ChapterDocument[]>([]);
  const [textbooks, setTextbooks] = useState<Textbook[]>([]);
  const [textbookError, setTextbookError] = useState(false);
  const [expandedTextbooks, setExpandedTextbooks] = useState<Set<string>>(new Set());

  useEffect(() => { loadDocuments(); loadCourses(); }, [loadDocuments, loadCourses]);

  // Fetch chapters from backend API for each document
  useEffect(() => {
    let cancelled = false;
    Promise.all(documents.map(doc => listChapters(doc.id)))
      .then(results => {
        if (!cancelled) setChapters(results.flat());
      })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [documents]);

  // Fetch textbooks (extracted so it can be retried on failure)
  const loadTextbooks = useCallback(() => {
    listTextbooks()
      .then((result) => {
        setTextbooks(result);
        setTextbookError(false);
      })
      .catch((err) => {
        console.error(err);
        setTextbookError(true);
      });
  }, []);

  useEffect(() => {
    loadTextbooks();
  }, [documents, loadTextbooks]);

  const handleFilesSelected = useCallback(async (files: File[]) => {
    for (const file of files) {
      await uploadFile(file);
    }
  }, [uploadFile]);

  const handleSelectDoc = useCallback((doc: DocumentFile) => {
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

  const toggleTextbook = useCallback((id: string) => {
    setExpandedTextbooks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleDeleteTextbook = useCallback(async (id: string) => {
    await deleteTextbook(id);
    setTextbooks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Build a parentId -> chapter count lookup
  const chapterCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const ch of chapters) {
      counts[ch.parentId] = (counts[ch.parentId] ?? 0) + 1;
    }
    return counts;
  }, [chapters]);

  const graph = useMemo(
    () => buildKnowledgeGraph(documents, courses, safeSessions, chapters),
    [documents, courses, safeSessions, chapters],
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
        <UploadZone onFilesSelected={handleFilesSelected} onUrlSubmit={uploadVideoUrl} isLoading={isLoading} />
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
      ) : documents.length === 0 && textbooks.length === 0 && !textbookError ? (
        <EmptyState
          icon="📂"
          title="No documents yet"
          description="Upload your first study material to get started"
        />
      ) : (
        <div className="space-y-2">
          {/* Textbook fetch error banner */}
          {textbookError && (
            <div className="bg-red-900/30 border border-red-700/50 text-red-300 rounded-lg p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <HiExclamationCircle className="w-5 h-5 shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium">Couldn't load textbooks</p>
                  <p className="text-sm text-red-400/80">Something went wrong fetching your textbooks.</p>
                </div>
              </div>
              <button
                onClick={loadTextbooks}
                className="shrink-0 rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-500 transition-colors"
              >
                Retry
              </button>
            </div>
          )}
          {/* Textbook cards */}
          {textbooks.map((tb) => {
            const expanded = expandedTextbooks.has(tb.id);
            return (
              <div
                key={tb.id}
                className="rounded-xl border border-slate-700/50 bg-slate-800/40 overflow-hidden"
              >
                {/* Textbook header row */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-800/70 transition-colors"
                  onClick={() => toggleTextbook(tb.id)}
                >
                  {expanded
                    ? <HiChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                    : <HiChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  }
                  <HiBookOpen className="w-5 h-5 text-cyan-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-200 truncate">{tb.name}</p>
                    <p className="text-xs text-slate-500">{tb.documents.length} chapter{tb.documents.length !== 1 ? 's' : ''}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteTextbook(tb.id); }}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-700/50 transition-colors"
                    title="Delete textbook"
                  >
                    <HiTrash className="w-4 h-4" />
                  </button>
                </div>

                {/* Expanded chapter list */}
                {expanded && (
                  <div className="border-t border-slate-700/30 bg-slate-900/30 px-3 py-2">
                    <FileList
                      documents={tb.documents}
                      onDelete={undefined}
                      onSelect={handleSelectDoc}
                      courses={[]}
                      onMoveToCourse={undefined}
                      onUpdateTags={handleUpdateTags}
                      chapterCounts={{}}
                    />
                  </div>
                )}
              </div>
            );
          })}

          {/* Regular documents */}
          <FileList
            documents={documents}
            onDelete={deleteDocumentById}
            onSelect={handleSelectDoc}
            courses={courses.map(c => ({ id: c.id, name: c.name, documentIds: c.documentIds }))}
            onMoveToCourse={handleMoveToCourse}
            onUpdateTags={handleUpdateTags}
            chapterCounts={chapterCounts}
          />
        </div>
      )}
    </div>
  );
}
