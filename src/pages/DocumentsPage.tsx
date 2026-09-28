// DocumentsPage — full file explorer (Finder / Drive / Nautilus style).
// Two-pane layout: folder tree sidebar + main pane with toolbar, breadcrumbs,
// grid/list views, drag & drop everywhere, inline previews, rename/move/delete
// for both files and folders, and multi-key sorting.
//
// The Graph view (knowledge graph) is kept from the previous page design.
import { useEffect, useCallback, useState, useMemo, useRef, lazy, Suspense } from 'react';
import FolderTree from '../components/documents/FolderTree';
import ExplorerItem from '../components/documents/ExplorerItem';
import UploadDropdown from '../components/documents/UploadDropdown';
import FilePreview from '../components/documents/FilePreview';
import EmptyState from '../components/shared/EmptyState';
import Spinner from '../components/shared/Spinner';
import ConfirmDialog from '../components/shared/ConfirmDialog';

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
import {
  listChapters, listTextbooks, deleteTextbook, listStudyGuides, getStudyGuide,
  listFolderTree, createFolder, deleteFolder, updateFolder, updateDocument as updateDocumentApi,
  listFolderDocuments,
} from '../services/api/client';
import type { FolderTreeNode } from '../services/api/client';
import { buildKnowledgeGraph } from '../utils/buildKnowledgeGraph';
import { extendGraphWithTopics } from '../utils/graphTopics';
import { buildTopicMap } from '../utils/buildTopicMap';
import { useFlashcardStore } from '../store/flashcardStore';
import { useLearningStore } from '../store/learningStore';
import type { StudyGuide } from '../types/studyGuide';

import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  HiOutlineShare, HiChevronDown, HiChevronRight, HiChevronUp, HiBookOpen, HiTrash,
  HiExclamationCircle, HiFolder,
} from 'react-icons/hi';
import {
  HiSquares2X2, HiOutlineListBullet, HiArrowsUpDown,
  HiBars3BottomLeft, HiMagnifyingGlass, HiHome,
  HiChevronLeft, HiChevronRight as HiChevronRight2, HiFolderPlus,
} from 'react-icons/hi2';
import type { KGNode } from '../types/knowledgeGraph';
import type { ChapterDocument, Textbook, DocumentFile } from '../types/document';

type SortKey = 'name' | 'recent' | 'size' | 'type';
type SortDir = 'asc' | 'desc';
type DragItem = { kind: 'folder'; id: string } | { kind: 'doc'; id: string };

const FOLDER_PALETTE = ['#38a6cf', '#ff7fa9', '#2f9e57', '#f59e0b', '#918d8c'];

/** Human-readable file-type bucket used by the "type" sort (folders first, then alphabetical). */
function typeBucket(doc: DocumentFile): string {
  const t = doc.type;
  if (['pdf', 'docx', 'txt', 'md', 'epub'].includes(t)) return 'doc';
  if (['xlsx', 'csv'].includes(t)) return 'sheet';
  if (['pptx'].includes(t)) return 'slides';
  if (t === 'image') return 'image';
  if (t === 'audio') return 'audio';
  if (t === 'video' || t === 'youtube') return 'video';
  return 'other';
}

export default function DocumentsPage() {
  const { documents, isLoading, loadDocuments, uploadFile, uploadVideoUrl, deleteDocumentById } = useDocuments();
  const updateDocument = useDocumentStore((s) => s.updateDocument);
  const setCurrentDocument = useDocumentStore((s) => s.setCurrentDocument);
  const { courses, loadCourses } = useCourses();
  const sessions = useChatStore((s) => s.sessions);
  const safeSessions = useMemo(() => sessions ?? [], [sessions]);
  const decks = useFlashcardStore((s) => s.decks);
  const cardsByDeckId = useFlashcardStore((s) => s.cardsByDeckId);
  const fetchDecks = useFlashcardStore((s) => s.fetchDecks);
  const fetchCards = useFlashcardStore((s) => s.fetchCards);
  const skills = useLearningStore((s) => s.skills);
  const loadSkills = useLearningStore((s) => s.loadSkills);
  const setSelectedNode = useKnowledgeGraphStore((s) => s.setSelectedNode);
  const navigate = useNavigate();

  const [viewMode, setViewMode] = useState<'explorer' | 'graph'>('explorer');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [chapters, setChapters] = useState<ChapterDocument[]>([]);
  const [textbooks, setTextbooks] = useState<Textbook[]>([]);
  const [textbookError, setTextbookError] = useState(false);
  const [expandedTextbooks, setExpandedTextbooks] = useState<Set<string>>(new Set());
  const [guides, setGuides] = useState<StudyGuide[] | null>(null);
  const [searchParams] = useSearchParams();
  const searchQuery = (searchParams.get('q') || '').toLowerCase();

  // ── Explorer state ───────────────────────────────────────────────────────────
  const [tree, setTree] = useState<FolderTreeNode[]>([]);
  const [history, setHistory] = useState<{ stack: (string | null)[]; index: number }>({ stack: [null], index: 0 });
  const currentFolderId = history.stack[history.index] ?? null;
  // ['course:<id>', folderId, ...] — a virtual root-level "Courses" node per course.
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('recent');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [sortOpen, setSortOpen] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<DocumentFile | null>(null);
  const [dragging, setDragging] = useState<DragItem | null>(null);
  const [dragOverPane, setDragOverPane] = useState(false);
  const [confirm, setConfirm] = useState<
    | { kind: 'none' }
    | { kind: 'folder'; id: string; name: string; hasContents: boolean }
    | { kind: 'doc'; id: string; name: string }
  >({ kind: 'none' });
  const [urlMode, setUrlMode] = useState(false);
  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const newFolderInputRef = useRef<HTMLInputElement>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const [uploadMenuOpen, setUploadMenuOpen] = useState(false);
  useEffect(() => {
    if (!uploadMenuOpen) return;
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest?.('[data-upload-menu]')) return;
      setUploadMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [uploadMenuOpen]);

  // ── Folder tree loading + mutations ──────────────────────────────────────────
  const refreshTree = useCallback(async () => {
    try {
      const t = await listFolderTree();
      setTree(t);
    } catch (err) {
      console.error('Failed to load folder tree:', err);
    }
  }, []);
  useEffect(() => {
    let cancelled = false;
    listFolderTree()
      .then((t) => { if (!cancelled) setTree(t); })
      .catch((err) => console.error('Failed to load folder tree:', err));
    return () => { cancelled = true; };
  }, []);

  const toggleFolder = useCallback((id: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleCreateFolder = useCallback(async (parentId: string | null, name: string) => {
    const f = await createFolder(name, FOLDER_PALETTE[Math.floor(Math.random() * FOLDER_PALETTE.length)], parentId);
    setExpandedFolders((prev) => new Set(prev).add(parentId ?? ''));
    await refreshTree();
    return f;
  }, [refreshTree]);

  const handleRenameFolder = useCallback(async (id: string, name: string) => {
    await updateFolder(id, { name });
    await refreshTree();
  }, [refreshTree]);

  const handleMoveFolder = useCallback(async (id: string, newParentId: string | null) => {
    await updateFolder(id, { parentId: newParentId });
    await refreshTree();
  }, [refreshTree]);

  const handleDeleteFolder = useCallback(async (id: string) => {
    await deleteFolder(id);
    // Documents + subfolders survive (promoted to root). If we were inside the
    // deleted folder, go back to root.
    setHistory((h) => {
      const cur = h.stack[h.index] ?? null;
      if (cur !== id) return h;
      const stack = [...h.stack.slice(0, h.index + 1), null];
      return { stack, index: stack.length - 1 };
    });
    await Promise.all([refreshTree(), loadDocuments()]);
  }, [refreshTree, loadDocuments]);

  // ── Navigation (Explorer-style back/forward history) ─────────────────────────
  const navigateToFolder = useCallback((folderId: string | null) => {
    setHistory((h) => {
      const stack = [...h.stack.slice(0, h.index + 1), folderId];
      return { stack, index: stack.length - 1 };
    });
    setSelectedId(null);
    setFilterText('');
  }, []);
  const goBack = useCallback(() => setHistory((h) => (h.index > 0 ? { ...h, index: h.index - 1 } : h)), []);
  const goForward = useCallback(() => setHistory((h) => (h.index < h.stack.length - 1 ? { ...h, index: h.index + 1 } : h)), []);

  const handleRenameDoc = useCallback(async (docId: string, name: string) => {
    await updateDocumentApi(docId, { name });
    updateDocument(docId, { name });
  }, [updateDocument]);

  const handleMoveDocToFolder = useCallback(async (docId: string, folderId: string | null) => {
    await updateDocumentApi(docId, { folderId });
    updateDocument(docId, { folderId });
    await refreshTree(); // doc counts change
  }, [updateDocument, refreshTree]);

  // ── Drag & drop ─────────────────────────────────────────────────────────────
  const handleDropOnFolderTarget = useCallback(async (targetId: string | null) => {
    if (!dragging) return;
    const item = dragging;
    setDragging(null);
    try {
      if (item.kind === 'doc') {
        await handleMoveDocToFolder(item.id, targetId);
      } else if (item.id !== targetId) {
        await handleMoveFolder(item.id, targetId); // server rejects cycles with 400
      }
    } catch (err) {
      console.error('Move failed:', err);
    }
  }, [dragging, handleMoveDocToFolder, handleMoveFolder]);

  const uploadFilesTo = useCallback(async (folderId: string | null, files: File[]) => {
    setUploading(true);
    try {
      for (const file of files) {
        await uploadFile(file, folderId);
      }
      await refreshTree();
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
    }
  }, [uploadFile, refreshTree]);

  // Whole-pane drop (background of the main pane): files → current folder,
  // dragged items → current folder.
  const handlePaneDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverPane(false);
    if (e.dataTransfer.files.length > 0) {
      await uploadFilesTo(currentFolderId, Array.from(e.dataTransfer.files));
      return;
    }
    await handleDropOnFolderTarget(currentFolderId);
  }, [currentFolderId, uploadFilesTo, handleDropOnFolderTarget]);

  // ── Derived data ─────────────────────────────────────────────────────────────
  const searchFiltered = useMemo(
    () => searchQuery
      ? documents.filter(d =>
          d.name.toLowerCase().includes(searchQuery) ||
          (d.tags ?? []).some(t => t.toLowerCase().includes(searchQuery)))
      : documents,
    [documents, searchQuery],
  );

  // Soft links for regular folder browsing (non-course folders).
  const [linkedIds, setLinkedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!currentFolderId) return;
    let cancelled = false;
    listFolderDocuments(currentFolderId)
      .then((refs) => {
        if (!cancelled) setLinkedIds(new Set(refs.filter((r) => r.isLink).map((r) => r.id)));
      })
      .catch((err) => console.error('Failed to load folder links:', err));
    return () => {
      cancelled = true;
    };
  }, [currentFolderId, documents.length]);

  // Files shown in the main pane. Inside a course node: everything the course
  // lists (physical residents + soft links). Otherwise: current folder.
  const folderDocs = useMemo(
    () => searchFiltered.filter((d) => (d.folderId ?? null) === currentFolderId || (currentFolderId !== null && linkedIds.has(d.id))),
    [searchFiltered, currentFolderId, linkedIds],
  );

  const sortDocs = useCallback((docs: DocumentFile[]) => {
    const sorted = [...docs];
    const dir = sortDir === 'asc' ? 1 : -1;
    sorted.sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return dir * a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        case 'size':
          return dir * (a.size - b.size);
        case 'type': {
          const tb = typeBucket(a).localeCompare(typeBucket(b));
          return dir * (tb !== 0 ? tb : a.name.localeCompare(b.name, undefined, { numeric: true }));
        }
        case 'recent':
        default:
          return dir * (a.createdAt - b.createdAt);
      }
    });
    return sorted;
  }, [sortKey, sortDir]);

  const visibleDocs = useMemo(
    () => sortDocs(folderDocs).filter((d) =>
      filterText ? d.name.toLowerCase().includes(filterText.toLowerCase()) : true),
    [folderDocs, sortDocs, filterText],
  );

  // Subfolders of the current folder, sorted to match the active sort.
  const childFolders = useMemo(() => {
    const kids = tree.filter((f) => (f.parentId ?? null) === currentFolderId);
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortKey === 'name') kids.sort((a, b) => dir * a.name.localeCompare(b.name));
    else if (sortKey === 'recent') kids.sort((a, b) => dir * (a.createdAt - b.createdAt));
    else kids.sort((a, b) => dir * a.name.localeCompare(b.name)); // size/type: folders by name
    return filterText ? kids.filter((f) => f.name.toLowerCase().includes(filterText.toLowerCase())) : kids;
  }, [tree, currentFolderId, sortKey, sortDir, filterText]);

  const breadcrumb = useMemo(() => {
    const path: FolderTreeNode[] = [];
    let cur = currentFolderId;
    while (cur) {
      const f = tree.find((t) => t.id === cur);
      if (!f) break;
      path.unshift(f);
      cur = f.parentId;
    }
    return path;
  }, [tree, currentFolderId]);
  const currentFolder = currentFolderId ? tree.find((t) => t.id === currentFolderId) : null;

  // Legal move destinations for the selected item (grey out own subtree).
  const moveTargetsForSelection = useMemo((): Array<{ id: string | null; name: string; disabled?: boolean }> => {
    const base: Array<{ id: string | null; name: string; disabled?: boolean }> = [
      { id: null, name: 'All documents' },
      ...tree.map((f) => ({ id: f.id, name: f.name })),
    ];
    if (!dragging) return base;
    if (dragging.kind === 'doc') return base;
    const self = tree.find((f) => f.id === dragging.id);
    return base.map((t) => ({
      ...t,
      disabled: t.id === dragging.id || Boolean(t.id && self?.isDescendantOf[t.id]),
    }));
  }, [tree, dragging]);

  const itemCount = childFolders.length + visibleDocs.length;
  const sortLabel = (key: SortKey) =>
    key === 'recent' ? 'Date' : key === 'name' ? 'Name' : key === 'size' ? 'Size' : 'Type';

  // ── Effects: data loading (kept from previous page) ─────────────────────────
  useEffect(() => {
    loadDocuments();
    loadCourses();
    fetchDecks().catch(() => {});
    // Roadmap skills give topic nodes their mastery on the graph.
    loadSkills().catch(() => {});
  }, [loadDocuments, loadCourses, fetchDecks, loadSkills]);

  // Fetch flashcard contents for mastery on the graph (mirrors TopicMapPage).
  const requestedCards = useRef(new Set<string>());
  useEffect(() => {
    for (const deck of decks) {
      if (deck.status !== 'done' || cardsByDeckId[deck.id] || requestedCards.current.has(deck.id)) continue;
      requestedCards.current.add(deck.id);
      fetchCards(deck.id).catch(() => {});
    }
  }, [decks, cardsByDeckId, fetchCards]);

  // Roadmap topics come from completed study guides.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listStudyGuides();
        const full = await Promise.all(
          list.filter((g) => g.status === 'done').map((g) => getStudyGuide(g.id).catch(() => null)),
        );
        if (!cancelled) setGuides(full.filter((g): g is StudyGuide => !!g));
      } catch (err) {
        console.error(err);
        if (!cancelled) setGuides([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleSelectDoc = useCallback((doc: DocumentFile) => {
    setCurrentDocument(doc);
    fetch(`${window.location.origin}/api/documents/${doc.id}/opened`, { method: 'POST' }).catch(() => {});
    navigate(`/documents/${doc.id}`);
  }, [setCurrentDocument, navigate]);

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

  const baseGraph = useMemo(
    () => buildKnowledgeGraph(documents, courses, safeSessions, chapters),
    [documents, courses, safeSessions, chapters],
  );
  const topicMap = useMemo(
    () => (guides ? buildTopicMap(courses, guides, decks, cardsByDeckId, skills ?? []) : null),
    [guides, courses, decks, cardsByDeckId, skills],
  );
  const graph = useMemo(
    () => extendGraphWithTopics(baseGraph.nodes, baseGraph.edges, topicMap, guides ?? [], decks),
    [baseGraph, topicMap, guides, decks],
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

  const handleOpenStep = useCallback((stepId: string) => navigate(`/learn/steps/${stepId}`), [navigate]);

  // ── Add-link (YouTube → transcript, anything else → bookmark) ──────────────
  const handleUrlSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    const URL_RE = /^(https?:\/\/)?[^\s]+\.[^\s]{2,}$/i;
    if (!URL_RE.test(trimmed)) {
      setUrlError('Please enter a valid URL (e.g. https://example.com/article)');
      return;
    }
    setUrlError(null);
    try {
      await uploadVideoUrl(trimmed, currentFolderId);
      setUrl('');
      setUrlMode(false);
      await refreshTree();
    } catch (err) {
      setUrlError(err instanceof Error ? err.message : 'Failed to process URL');
    }
  }, [url, currentFolderId, uploadVideoUrl, refreshTree]);

  const explorerMode = viewMode === 'explorer';
  const canGoBack = history.index > 0;
  const canGoForward = history.index < history.stack.length - 1;


  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ── Page header ── */}
      <div className="flex items-end justify-between">
        <div>
          <div className="card-kicker" style={{ fontSize: 13 }}>Library</div>
          <h1 style={{ fontSize: 32, margin: 'var(--space-1) 0 var(--space-2)' }}>Documents</h1>
          <p style={{ fontSize: 15, opacity: 0.6, margin: 0 }}>Upload and manage your study materials</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm" style={{ opacity: 0.6 }}>
            {documents.length} document{documents.length !== 1 ? 's' : ''}
          </span>
          {/* View toggle */}
          <div
            className="flex items-center p-0.5"
            style={{ background: 'var(--color-neutral-200)', borderRadius: 'var(--radius-md)' }}
          >
            <button
              onClick={() => setViewMode('explorer')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors"
              style={
                explorerMode
                  ? { background: 'var(--color-accent)', color: 'var(--color-bg)', borderRadius: 'var(--radius-md)' }
                  : { opacity: 0.6, borderRadius: 'var(--radius-md)' }
              }
              title="Explorer view"
            >
              <HiFolder className="h-4 w-4" />
              <span className="hidden sm:inline">Files</span>
            </button>
            <button
              onClick={() => setViewMode('graph')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors"
              style={
                !explorerMode
                  ? { background: 'var(--color-accent)', color: 'var(--color-bg)', borderRadius: 'var(--radius-md)' }
                  : { opacity: 0.6, borderRadius: 'var(--radius-md)' }
              }
              title="Graph view"
            >
              <HiOutlineShare className="h-4 w-4" />
              <span className="hidden sm:inline">Graph</span>
            </button>
          </div>
        </div>
      </div>

      {explorerMode && (
        <div
          className="card overflow-hidden p-0"
          style={{ minHeight: 560 }}
          onClick={() => setSelectedId(null)}
        >
          <div
            className="grid grid-cols-1 lg:grid-cols-[230px_minmax(0,1fr)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ── Explorer sidebar (Home / Courses / Folders) ── */}
            <aside
              className="border-r p-2.5 space-y-0.5"
              style={{ borderColor: 'var(--color-divider)', background: 'color-mix(in srgb, var(--color-text) 2.5%, transparent)' }}
            >
              {/* Home */}
              <button
                className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm w-full text-left transition-colors hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)]"
                style={{
                  background: currentFolderId === null ? 'color-mix(in srgb, var(--color-accent) 13%, transparent)' : 'transparent',
                  color: currentFolderId === null ? 'var(--color-accent-700)' : 'var(--color-text)',
                  fontWeight: currentFolderId === null ? 600 : 400,
                }}
                onClick={() => navigateToFolder(null)}
              >
                <HiHome className="w-4 h-4 shrink-0" style={{ color: 'var(--color-accent)' }} />
                <span className="flex-1 min-w-0 truncate">Home</span>
              </button>

              {/* Course folders live in the tree below — no separate Courses list */}

              {/* Folder tree (all folders, Home scope) */}
              <div className="pt-1">
                <div className="px-2.5 py-1 text-xs" style={{ opacity: 0.55, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                  Folders
                </div>
                <FolderTree
                  tree={tree}
                  currentId={currentFolderId}
                  expanded={expandedFolders}
                  onSelect={(id) => navigateToFolder(id)}
                  onToggle={toggleFolder}
                  onCreate={handleCreateFolder}
                  onRename={handleRenameFolder}
                  onMove={handleMoveFolder}
                  onDelete={async (id) => {
                    const f = tree.find((t) => t.id === id);
                    setConfirm({
                      kind: 'folder',
                      id,
                      name: f?.name ?? 'folder',
                      hasContents: Boolean(f && (f.docCount > 0 || f.hasChildren)),
                    });
                  }}
                  onDropOnFolder={handleDropOnFolderTarget}
                  onDropFiles={(targetId, files) => uploadFilesTo(targetId, files)}
                />
              </div>
            </aside>

            {/* ── Main column: command bar + address bar + pane ── */}
            <div className="min-w-0 flex flex-col">
              {/* Command bar (Explorer-style, sits above the address bar) */}
              <div
                className="flex items-center gap-1 px-2 py-1.5 flex-wrap border-b"
                style={{ borderColor: 'var(--color-divider)' }}
              >
                <UploadDropdown
                  disabled={uploading}
                  destinationName={currentFolder ? currentFolder.name : 'Home'}
                  onPickFiles={() => fileInputRef.current?.click()}
                  onAddLink={() => {
                    setUrlMode(true);
                    requestAnimationFrame(() => urlInputRef.current?.focus());
                  }}
                />
                <button
                  className="flex items-center gap-1.5 text-sm px-2.5 py-1.5 transition-colors hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)]"
                  style={{ borderRadius: 'var(--radius-md)', opacity: 0.85 }}
                  onClick={() => { setCreatingFolder(true); requestAnimationFrame(() => newFolderInputRef.current?.focus()); }}
                  title="New folder"
                >
                  <HiFolderPlus className="w-4 h-4" />
                  <span className="hidden md:inline">New folder</span>
                </button>
                {selectedId && (
                  <button
                    className="flex items-center gap-1.5 text-sm px-2.5 py-1.5 transition-colors hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)]"
                    style={{ borderRadius: 'var(--radius-md)', color: 'var(--color-danger)' }}
                    onClick={() => {
                      const f = tree.find((t) => t.id === selectedId);
                      if (f) setConfirm({ kind: 'folder', id: f.id, name: f.name, hasContents: f.docCount > 0 || f.hasChildren });
                      else {
                        const d = documents.find((x) => x.id === selectedId);
                        if (d) setConfirm({ kind: 'doc', id: d.id, name: d.name });
                      }
                    }}
                  >
                    <HiTrash className="w-4 h-4" />
                    <span className="hidden md:inline">Delete</span>
                  </button>
                )}
              </div>

              {/* Address bar: back / forward + breadcrumbs + search box */}
              <div
                className="flex items-center gap-1.5 px-2 py-1.5 border-b"
                style={{ borderColor: 'var(--color-divider)' }}
              >
                <button
                  className="p-1.5 transition-colors hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)] disabled:opacity-30"
                  style={{ borderRadius: 'var(--radius-md)' }}
                  onClick={goBack}
                  disabled={!canGoBack}
                  aria-label="Back"
                >
                  <HiChevronLeft className="w-4 h-4" />
                </button>
                <button
                  className="p-1.5 transition-colors hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)] disabled:opacity-30"
                  style={{ borderRadius: 'var(--radius-md)' }}
                  onClick={goForward}
                  disabled={!canGoForward}
                  aria-label="Forward"
                >
                  <HiChevronRight2 className="w-4 h-4" />
                </button>
                <div
                  className="flex-1 min-w-0 flex items-center gap-1 px-2.5 py-1.5 overflow-x-auto"
                  style={{ background: 'var(--color-bg)', border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-md)' }}
                >
                  <button
                    className="text-sm px-1.5 py-0.5 rounded transition-colors hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)] shrink-0"
                    style={{
                      fontWeight: breadcrumb.length === 0 ? 600 : 400,
                      color: breadcrumb.length === 0 ? 'var(--color-accent-700)' : 'var(--color-text)',
                    }}
                    onClick={() => navigateToFolder(null)}
                  >
                    Home
                  </button>
                  {breadcrumb.map((f, i) => (
                    <span key={f.id} className="flex items-center gap-1 shrink-0 min-w-0">
                      <HiChevronRight className="w-3 h-3 shrink-0" style={{ opacity: 0.4 }} />
                      <button
                        className="text-sm px-1.5 py-0.5 rounded transition-colors hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)] max-w-[220px] truncate"
                        title={f.name}
                        style={{
                          fontWeight: i === breadcrumb.length - 1 ? 600 : 400,
                          color: i === breadcrumb.length - 1 ? 'var(--color-accent-700)' : 'var(--color-text)',
                        }}
                        onClick={() => navigateToFolder(f.id)}
                      >
                        {f.name}
                      </button>
                    </span>
                  ))}
                </div>
                <div className="relative w-44 shrink-0 hidden sm:block">
                  <HiMagnifyingGlass className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ opacity: 0.4 }} />
                  <input
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                    placeholder="Search"
                    className="input text-sm pl-8 py-1.5 w-full"
                    style={{ borderRadius: 'var(--radius-md)' }}
                  />
                </div>
              </div>

              {/* Inline "add link" panel */}
              {urlMode && (
                <div className="p-3 border-b" style={{ borderColor: 'var(--color-divider)' }}>
                  <form onSubmit={handleUrlSubmit} className="flex flex-col sm:flex-row gap-2">
                    <input
                      ref={urlInputRef}
                      type="text"
                      value={url}
                      onChange={(e) => { setUrl(e.target.value); setUrlError(null); }}
                      placeholder="Paste a link — youtube.com/watch?v=… or any web page"
                      className="input flex-1"
                      autoFocus
                    />
                    <button type="submit" className="btn btn-primary">Add link</button>
                    <button type="button" className="btn" onClick={() => { setUrlMode(false); setUrlError(null); }}>Cancel</button>
                  </form>
                  {urlError && <p className="mt-2 text-sm" style={{ color: 'var(--color-danger)' }}>{urlError}</p>}
                </div>
              )}

              {/* Inline "new folder" input (command-bar triggered) */}
              {creatingFolder && (
                <form
                  className="flex items-center gap-2 px-3 py-2 border-b"
                  style={{ borderColor: 'var(--color-divider)' }}
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const input = newFolderInputRef.current;
                    const name = input?.value.trim();
                    setCreatingFolder(false);
                    if (name) await handleCreateFolder(currentFolderId, name);
                  }}
                >
                  <HiFolder className="w-5 h-5" style={{ color: 'var(--color-accent)' }} />
                  <input
                    ref={newFolderInputRef}
                    placeholder="Folder name…"
                    className="input text-sm flex-1 py-1.5"
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setCreatingFolder(false);
                    }}
                    onBlur={(e) => {
                      const name = e.target.value.trim();
                      if (name) {
                        void handleCreateFolder(currentFolderId, name).then(() => setCreatingFolder(false));
                      } else {
                        setCreatingFolder(false);
                      }
                    }}
                    autoFocus
                  />
                  <button type="submit" className="btn btn-primary text-sm px-3 py-1.5">Create</button>
                  <button type="button" className="btn text-sm px-3 py-1.5" onClick={() => setCreatingFolder(false)}>Cancel</button>
                </form>
              )}

              {/* ── Items pane ── */}
              <div
                className="flex-1 p-3"
                style={dragOverPane ? { outline: '2px dashed var(--color-accent)', outlineOffset: -6, background: 'color-mix(in srgb, var(--color-accent) 6%, transparent)' } : undefined}
                onDragOver={(e) => { e.preventDefault(); }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setDragOverPane(true);
                }}
                onDragLeave={() => {
                  setDragOverPane(false);
                }}
                onDrop={(e) => void handlePaneDrop(e)}
              >
            {/* ── View controls strip: sort + layout (right-aligned) ── */}
            <div className="flex items-center justify-end gap-1.5 px-1 pb-2">
              {/* Sort menu */}
              <div className="relative">
                <button
                  className="flex items-center gap-1.5 text-xs px-2.5 py-2 transition-colors hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)]"
                  style={{ opacity: 0.8, border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-md)' }}
                  onClick={() => { setSortOpen((o) => !o); setLayoutOpen(false); }}
                >
                  <HiArrowsUpDown className="w-4 h-4" />
                  Sort
                </button>
                {sortOpen && (
                  <div className="card absolute right-0 mt-1 p-1.5 w-48 z-20" style={{ boxShadow: 'var(--shadow-md)' }}>
                    {(['name', 'recent', 'size', 'type'] as SortKey[]).map((key) => (
                      <button
                        key={key}
                        className="flex items-center justify-between px-3 py-2 text-sm w-full text-left hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)]"
                        style={{ borderRadius: 'var(--radius-md)' }}
                        onClick={() => {
                          if (sortKey === key) {
                            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                          } else {
                            setSortKey(key);
                            // Sensible default direction per key.
                            setSortDir(key === 'name' || key === 'type' ? 'asc' : 'desc');
                          }
                          setSortOpen(false);
                        }}
                      >
                        {sortLabel(key)}
                        {sortKey === key && (
                          <span style={{ color: 'var(--color-accent)' }}>{sortDir === 'asc' ? '↑ asc' : '↓ desc'}</span>
                        )}
                      </button>
                    ))}
                    <p className="px-3 pt-1 text-[10px]" style={{ opacity: 0.45 }}>Click again to flip direction</p>
                  </div>
                )}
              </div>

              {/* Layout toggle */}
              <div className="relative">
                <button
                  className="flex items-center gap-1.5 text-xs px-2.5 py-2 transition-colors hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)]"
                  style={{ opacity: 0.8, border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-md)' }}
                  onClick={() => { setLayoutOpen((o) => !o); setSortOpen(false); }}
                  title="View layout"
                >
                  {layout === 'grid' ? <HiSquares2X2 className="w-4 h-4" /> : <HiBars3BottomLeft className="w-4 h-4" />}
                </button>
                {layoutOpen && (
                  <div className="card absolute right-0 mt-1 p-1.5 w-40 z-20" style={{ boxShadow: 'var(--shadow-md)' }}>
                    {(['grid', 'list'] as const).map((l) => (
                      <button
                        key={l}
                        className="flex items-center justify-between px-3 py-2 text-sm w-full text-left hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)] capitalize"
                        style={{ borderRadius: 'var(--radius-md)' }}
                        onClick={() => { setLayout(l); setLayoutOpen(false); }}
                      >
                        <span className="flex items-center gap-2">
                          {l === 'grid' ? <HiSquares2X2 className="w-4 h-4" /> : <HiOutlineListBullet className="w-4 h-4" />}
                          {l}
                        </span>
                        {layout === l && <span style={{ color: 'var(--color-accent)' }}>✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Items ── */}
            {isLoading && documents.length === 0 ? (
              <div className="flex justify-center py-10"><Spinner /></div>
            ) : searchFiltered.length === 0 && textbooks.length === 0 && !textbookError ? (
              <EmptyState
                icon="📂"
                title="No documents yet"
                description="Upload your first study material to get started"
              />
            ) : itemCount === 0 ? (
              <div className="text-center py-12 text-sm" style={{ opacity: 0.5 }}>
                {filterText ? `No items match “${filterText}”.` : 'This folder is empty. Drop files here or click Upload.'}
              </div>
            ) : layout === 'grid' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {childFolders.map((f) => (
                  <ExplorerItem
                    key={f.id}
                    kind="folder"
                    view="grid"
                    name={f.name}
                    color={f.color}
                    docCount={f.docCount}
                    hasChildren={f.hasChildren}
                    isSelected={selectedId === f.id}
                    moveTargets={moveTargetsForSelection}
                    onSelect={() => setSelectedId(f.id)}
                    onOpen={() => navigateToFolder(f.id)}
                    onRename={(name) => handleRenameFolder(f.id, name)}
                    onDelete={async () => {
                      setConfirm({ kind: 'folder', id: f.id, name: f.name, hasContents: f.docCount > 0 || f.hasChildren });
                    }}
                    onMoveTo={async (target) => {
                      await handleMoveFolder(f.id, target);
                    }}
                    onDragStartItem={() => setDragging({ kind: 'folder', id: f.id })}
                    onDragEndItem={() => setDragging(null)}
                    onDropOnFolder={async () => {
                      if (!dragging) return;
                      if (dragging.kind === 'doc') await handleMoveDocToFolder(dragging.id, f.id);
                      else if (dragging.id !== f.id) await handleMoveFolder(dragging.id, f.id).catch((err) => console.error(err));
                      setDragging(null);
                    }}
                    onDropFiles={dragging ? undefined : (files) => uploadFilesTo(f.id, files)}
                  />
                ))}
                {visibleDocs.map((doc) => (
                  <ExplorerItem
                    key={doc.id}
                    kind="file"
                    view="grid"
                    name={doc.name}
                    doc={doc}
                    isClassifying={doc.classifyStatus === 'classifying' || doc.classifyStatus === 'pending'}
                    isSelected={selectedId === doc.id}
                    moveTargets={moveTargetsForSelection}
                    onSelect={() => setSelectedId(doc.id)}
                    onOpen={() => setPreviewDoc(doc)}
                    onPreview={() => setPreviewDoc(doc)}
                    onRename={(name) => handleRenameDoc(doc.id, name)}
                    onDelete={async () => {
                      setConfirm({ kind: 'doc', id: doc.id, name: doc.name });
                    }}
                    onMoveTo={async (target) => {
                      await handleMoveDocToFolder(doc.id, target);
                    }}
                    onDownload={() => {
                      const a = document.createElement('a');
                      a.href = `/api/documents/${doc.id}/download`;
                      a.download = doc.name;
                      a.click();
                    }}
                    onDragStartItem={() => setDragging({ kind: 'doc', id: doc.id })}
                    onDragEndItem={() => setDragging(null)}
                  />
                ))}
              </div>
            ) : (
              <div className="card overflow-hidden" style={{ padding: 0 }}>
                {/* List header row */}
                <div
                  className="flex items-center gap-3 px-3 py-2 text-xs font-medium"
                  style={{ borderBottom: '1px solid var(--color-divider)', opacity: 0.6 }}
                >
                  <button
                    className="flex items-center gap-1 flex-1 min-w-0 text-left"
                    onClick={() => { if (sortKey === 'name') setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')); else { setSortKey('name'); setSortDir('asc'); } }}
                  >
                    Name {sortKey === 'name' && (sortDir === 'asc' ? <HiChevronUp className="w-3 h-3" /> : <HiChevronDown className="w-3 h-3" />)}
                  </button>
                  <button
                    className="hidden sm:block text-xs w-24 shrink-0 text-left"
                    onClick={() => { if (sortKey === 'type') setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')); else { setSortKey('type'); setSortDir('asc'); } }}
                  >
                    Type {sortKey === 'type' && (sortDir === 'asc' ? <HiChevronUp className="w-3 h-3" /> : <HiChevronDown className="w-3 h-3" />)}
                  </button>
                  <button
                    className="hidden md:block text-xs w-20 shrink-0 text-right"
                    onClick={() => { if (sortKey === 'size') setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')); else { setSortKey('size'); setSortDir('desc'); } }}
                  >
                    Size {sortKey === 'size' && (sortDir === 'asc' ? <HiChevronUp className="w-3 h-3" /> : <HiChevronDown className="w-3 h-3" />)}
                  </button>
                  <button
                    className="hidden md:block text-xs w-24 shrink-0 text-left"
                    onClick={() => { if (sortKey === 'recent') setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')); else { setSortKey('recent'); setSortDir('desc'); } }}
                  >
                    Modified {sortKey === 'recent' && (sortDir === 'asc' ? <HiChevronUp className="w-3 h-3" /> : <HiChevronDown className="w-3 h-3" />)}
                  </button>
                  <span className="w-6 shrink-0" />
                </div>
                {childFolders.map((f) => (
                  <ExplorerItem
                    key={f.id}
                    kind="folder"
                    view="list"
                    name={f.name}
                    color={f.color}
                    docCount={f.docCount}
                    hasChildren={f.hasChildren}
                    isSelected={selectedId === f.id}
                    moveTargets={moveTargetsForSelection}
                    onSelect={() => setSelectedId(f.id)}
                    onOpen={() => navigateToFolder(f.id)}
                    onRename={(name) => handleRenameFolder(f.id, name)}
                    onDelete={async () => {
                      setConfirm({ kind: 'folder', id: f.id, name: f.name, hasContents: f.docCount > 0 || f.hasChildren });
                    }}
                    onMoveTo={async (target) => {
                      await handleMoveFolder(f.id, target);
                    }}
                    onDragStartItem={() => setDragging({ kind: 'folder', id: f.id })}
                    onDragEndItem={() => setDragging(null)}
                    onDropOnFolder={async () => {
                      if (!dragging) return;
                      if (dragging.kind === 'doc') await handleMoveDocToFolder(dragging.id, f.id);
                      else if (dragging.id !== f.id) await handleMoveFolder(dragging.id, f.id).catch((err) => console.error(err));
                      setDragging(null);
                    }}
                    onDropFiles={dragging ? undefined : (files) => uploadFilesTo(f.id, files)}
                  />
                ))}
                {visibleDocs.map((doc) => (
                  <ExplorerItem
                    key={doc.id}
                    kind="file"
                    view="list"
                    name={doc.name}
                    doc={doc}
                    isClassifying={doc.classifyStatus === 'classifying' || doc.classifyStatus === 'pending'}
                    isSelected={selectedId === doc.id}
                    moveTargets={moveTargetsForSelection}
                    onSelect={() => setSelectedId(doc.id)}
                    onOpen={() => setPreviewDoc(doc)}
                    onPreview={() => setPreviewDoc(doc)}
                    onRename={(name) => handleRenameDoc(doc.id, name)}
                    onDelete={async () => {
                      setConfirm({ kind: 'doc', id: doc.id, name: doc.name });
                    }}
                    onMoveTo={async (target) => {
                      await handleMoveDocToFolder(doc.id, target);
                    }}
                    onDownload={() => {
                      const a = document.createElement('a');
                      a.href = `/api/documents/${doc.id}/download`;
                      a.download = doc.name;
                      a.click();
                    }}
                    onDragStartItem={() => setDragging({ kind: 'doc', id: doc.id })}
                    onDragEndItem={() => setDragging(null)}
                  />
                ))}
              </div>
            )}

            {/* Textbooks (root only) — kept from the previous design */}
            {currentFolderId === null && (textbooks.length > 0 || textbookError) && (
              <div className="space-y-2">
                {textbookError && (
                  <div
                    className="p-4 flex items-center justify-between gap-4"
                    style={{
                      background: 'color-mix(in srgb, var(--color-danger) 12%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--color-danger) 35%, transparent)',
                      color: 'var(--color-danger)',
                      borderRadius: 'var(--radius-md)',
                    }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <HiExclamationCircle className="w-5 h-5 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium">Couldn't load textbooks</p>
                        <p className="text-sm" style={{ opacity: 0.8 }}>Something went wrong fetching your textbooks.</p>
                      </div>
                    </div>
                    <button onClick={loadTextbooks} className="btn btn-primary shrink-0">
                      Retry
                    </button>
                  </div>
                )}
                {textbooks.map((tb) => {
                  const expanded = expandedTextbooks.has(tb.id);
                  return (
                    <div key={tb.id} className="card overflow-hidden">
                      <div
                        className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)]"
                        onClick={() => toggleTextbook(tb.id)}
                      >
                        {expanded
                          ? <HiChevronDown className="w-4 h-4 shrink-0" style={{ opacity: 0.6 }} />
                          : <HiChevronRight className="w-4 h-4 shrink-0" style={{ opacity: 0.6 }} />
                        }
                        <HiBookOpen className="w-5 h-5 shrink-0" style={{ color: 'var(--color-accent)' }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{tb.name}</p>
                          <p className="text-xs" style={{ opacity: 0.5 }}>{tb.documents.length} chapter{tb.documents.length !== 1 ? 's' : ''}</p>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteTextbook(tb.id); }}
                          className="p-1.5 transition-colors hover:text-[var(--color-danger)] hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)]"
                          style={{ opacity: 0.6, borderRadius: 'var(--radius-md)' }}
                          title="Delete textbook"
                        >
                          <HiTrash className="w-4 h-4" />
                        </button>
                      </div>
                      {expanded && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 px-3 py-3" style={{ borderTop: '1px solid var(--color-divider)' }}>
                          {tb.documents.map((doc) => (
                            <ExplorerItem
                              key={doc.id}
                              kind="file"
                              view="grid"
                              name={doc.name}
                              doc={doc}
                              isSelected={false}
                              moveTargets={[]}
                              onOpen={() => handleSelectDoc(doc)}
                              onRename={async () => {}}
                              onDelete={async () => {}}
                              onMoveTo={async () => {}}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Status bar (Explorer-style) */}
            <div
              className="flex items-center justify-between px-3 py-1.5 text-xs border-t"
              style={{ borderColor: 'var(--color-divider)', opacity: 0.65 }}
            >
              <span>{itemCount} item{itemCount !== 1 ? 's' : ''}</span>
              {selectedId && <span>1 item selected</span>}
            </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Preview modal ── */}
      <FilePreview
        doc={previewDoc}
        onClose={() => setPreviewDoc(null)}
        onOpenDetail={(d) => {
          setPreviewDoc(null);
          handleSelectDoc(d);
        }}
      />

      {/* ── Delete confirmation ── */}
      {confirm.kind === 'folder' && (
        <ConfirmDialog
          open
          title={`Delete “${confirm.name}”?`}
          message={
            confirm.hasContents
              ? 'Documents and subfolders inside it will be kept and moved to the top level.'
              : 'This folder is empty.'
          }
          onConfirm={async () => {
            const { id } = confirm;
            setConfirm({ kind: 'none' });
            await handleDeleteFolder(id);
          }}
          onCancel={() => setConfirm({ kind: 'none' })}
        />
      )}
      {confirm.kind === 'doc' && (
        <ConfirmDialog
          open
          title={`Delete “${confirm.name}”?`}
          message="The file and its AI analysis will be permanently removed."
          onConfirm={async () => {
            const { id } = confirm;
            setConfirm({ kind: 'none' });
            await deleteDocumentById(id);
            await refreshTree();
          }}
          onCancel={() => setConfirm({ kind: 'none' })}
        />
      )}

      {/* ── Graph view (unchanged) ── */}
      {viewMode === 'graph' && (
        <div className="card relative overflow-hidden h-[calc(100vh-12rem)]">
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
                      <div
                        className="w-10 h-10 rounded-full border-3 animate-spin"
                        style={{ borderColor: 'var(--color-neutral-300)', borderTopColor: 'var(--color-accent)' }}
                      />
                      <p className="text-sm" style={{ opacity: 0.5 }}>Loading graph…</p>
                    </div>
                  </div>
                }
              >
                <GraphViewer graph={graph} onNodeClick={handleGraphNodeClick} />
              </Suspense>

              {/* Node Detail Panel — right side, slides in */}
              <NodeDetailPanel graph={graph} onOpenDocument={handleOpenDocument} onOpenStep={handleOpenStep} />

              {/* Stats Bar — bottom overlay */}
              <GraphStats graph={graph} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
