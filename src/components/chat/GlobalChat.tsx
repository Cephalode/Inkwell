import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { HiPaperAirplane, HiX, HiChatAlt2, HiPlus, HiChevronDown, HiClock, HiChevronLeft, HiChevronRight, HiBookOpen, HiDocumentText, HiOutlineSparkles } from 'react-icons/hi';
import { HiOutlineEye } from 'react-icons/hi2';
import Markdown from '../shared/Markdown';
import { normalizeMathText } from '../../utils/asciiMath';
import { useChatStore } from '../../store/chatStore';
import { useDocumentStore } from '../../store/documentStore';
import { useCourseStore } from '../../store/courseStore';
import { useLearningStore } from '../../store/learningStore';
import { runAgentTurn, type SystemMessageContext } from '../../services/chat/agent';
import { generateUUID } from '../../utils/uuid';
import { listTextbooks } from '../../services/api/client';
import MentionPopover, { type MentionableItem } from './MentionPopover';
import type { ChatMessage, ChatSession } from '../../types/chat';
import { useIsMobile } from '../../hooks/useIsMobile';
import type { Textbook } from '../../types/document';

// ── Tool display labels ────────────────────────────────────────────────────

const TOOL_LABELS: Record<string, { icon: string; label: string }> = {
  list_documents: { icon: '📂', label: 'Listing documents' },
  get_document: { icon: '📄', label: 'Reading document' },
  list_chapters: { icon: '📑', label: 'Listing chapters' },
  get_chapter: { icon: '📖', label: 'Reading chapter' },
  classify_document: { icon: '🏷️', label: 'Classifying document' },
  summarize: { icon: '📝', label: 'Summarizing' },
  search_documents: { icon: '🔍', label: 'Searching documents' },
  get_current_context: { icon: '🌐', label: 'Getting context' },
};

function getToolDisplayLabel(toolName: string): string {
  const entry = TOOL_LABELS[toolName];
  return entry ? `${entry.icon} ${entry.label}` : `🔧 ${toolName.replace(/_/g, ' ')}`;
}

// ── Spinner SVG ───────────────────────────────────────────────────────────────

function Spinner({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ── Collapsible tool-call summary ──────────────────────────────────────────

function ToolCallSummary() {
  const pendingTools = useChatStore((s) => s.pendingTools);
  const [expanded, setExpanded] = useState(false);

  if (pendingTools.length === 0) return null;

  const errorCount = pendingTools.filter((t) => t.status === 'error').length;
  const stillRunning = pendingTools.some((t) => t.status === 'running');

  return (
    <div className="flex justify-start">
      <div
        className="max-w-[85%] px-4 py-2 text-sm"
        style={{
          background: stillRunning ? 'var(--color-neutral-200)' : 'var(--color-neutral-100)',
          border: '1px solid var(--color-divider)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-2 w-full text-left transition-colors"
        >
          {stillRunning ? (
            <Spinner />
          ) : (
            <span className="text-xs">✓</span>
          )}
          <span className="font-medium">
            {stillRunning
              ? `Using ${pendingTools.length} tool${pendingTools.length > 1 ? 's' : ''}…`
              : `Used ${pendingTools.length} tool${pendingTools.length > 1 ? 's' : ''}`}
          </span>
          {errorCount > 0 && (
            <span className="text-xs" style={{ color: 'var(--color-danger)' }}>({errorCount} error{errorCount > 1 ? 's' : ''})</span>
          )}
          <span className="text-xs ml-auto" style={{ opacity: 0.5 }}>{expanded ? '▲' : '▼'}</span>
        </button>

        {expanded && (
          <div className="mt-2 space-y-1.5 pl-1 border-l-2 ml-1" style={{ borderColor: 'var(--color-neutral-300)' }}>
            {pendingTools.map((tool, i) => (
              <div key={i} className="pl-3 py-1">
                <div className="flex items-center gap-2 text-xs">
                  {tool.status === 'running' ? (
                    <Spinner className="w-3 h-3" />
                  ) : tool.status === 'done' ? (
                    <span style={{ color: 'var(--color-success)' }}>✓</span>
                  ) : (
                    <span style={{ color: 'var(--color-danger)' }}>✗</span>
                  )}
                  <span className="font-medium">{getToolDisplayLabel(tool.name)}</span>
                </div>
                {tool.result && (
                  <p className="text-xs mt-0.5 line-clamp-2" style={{ opacity: 0.6 }}>{tool.result}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tool progress indicator (shows currently running tool) ───────────────────

function ToolProgressIndicator() {
  const pendingTools = useChatStore((s) => s.pendingTools);
  // NOTE: Avoid Array.prototype.findLast() (ES2023, Safari < 15.4 / Chrome < 97).
  // It is a runtime API, so esbuild never transpiles/polyfills it — on older
  // mobile browsers it throws "findLast is not a function" and crashes the
  // React render tree (blank screen). reverse()+find() is universally supported
  // and preserves the "last matching element" semantics.
  const runningTool = [...pendingTools].reverse().find((t) => t.status === 'running');
  if (!runningTool) return null;

  return (
    <div className="flex justify-start">
      <div
        className="max-w-[85%] px-4 py-3 text-sm flex items-center gap-2"
        style={{
          background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
          border: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--color-accent-700)',
        }}
      >
        <Spinner />
        <span className="text-xs">{getToolDisplayLabel(runningTool.name)}…</span>
      </div>
    </div>
  );
}

// ── Relative time helper ─────────────────────────────────────────────────────

function relativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

// ── Session list dropdown ────────────────────────────────────────────────────

function SessionListDropdown({
  sessions,
  activeSessionId,
  onSelect,
  onNew,
  onDelete,
  onClose,
}: {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelect: (id: string) => void | Promise<void>;
  onNew: () => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="card absolute top-full left-0 mt-1 w-72 z-50 overflow-hidden"
      style={{ boxShadow: 'var(--shadow-lg)' }}
    >
      <button
        onClick={onNew}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-[var(--color-neutral-200)] transition-colors"
        style={{ color: 'var(--color-accent)', borderBottom: '1px solid var(--color-divider)' }}
      >
        <HiPlus className="w-4 h-4" />
        New chat
      </button>
      <div className="max-h-64 overflow-y-auto">
        {sessions.length === 0 ? (
          <div className="px-3 py-4 text-sm text-center" style={{ opacity: 0.5 }}>No sessions yet</div>
        ) : (
          sessions.map((session) => (
            <div
              key={session.id}
              className={`group flex items-start gap-2 px-3 py-2.5 text-sm cursor-pointer transition-colors ${
                session.id === activeSessionId ? '' : 'hover:bg-[var(--color-neutral-200)]'
              }`}
              style={
                session.id === activeSessionId
                  ? { background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)' }
                  : undefined
              }
              onClick={() => {
                onSelect(session.id);
                onClose();
              }}
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">
                  {session.title === 'New chat' ? 'New chat' : session.title}
                </div>
                <div className="flex items-center gap-1 text-xs mt-0.5" style={{ opacity: 0.55 }}>
                  <HiClock className="w-3 h-3 shrink-0" />
                  <span>{relativeTime(session.updatedAt)}</span>
                  {session.messages.length > 0 && (
                    <span className="truncate ml-1">
                      — {session.messages[0].content.slice(0, 30)}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(session.id);
                }}
                className="opacity-0 group-hover:opacity-100 p-0.5 text-[var(--color-neutral-600)] hover:text-[var(--color-danger)] transition-all shrink-0"
                title="Delete session"
              >
                <HiX className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Main GlobalChat component ───────────────────────────────────────────────

/** Synthetic @-reference id for "the page I'm looking at". */
const CURRENT_PAGE_REF_ID = '__current_page__';

export default function GlobalChat() {
  const {
    isOpen,
    messages,
    isLoading,
    pendingTools,
    sessions,
    activeSessionId,
    close,
    toggle,
    addMessage,
    setLoading,
    setPendingTools,
    createNewSession,
    setActiveSession,
    deleteSession,
    loadSessions,
  } = useChatStore();
  const currentDocument = useDocumentStore((s) => s.currentDocument);
  const courses = useCourseStore((s) => s.courses);
  const params = useParams();
  const isMobile = useIsMobile();

  // Desktop rail collapse state (initialized COLLAPSED — the chat rail must
  // not open itself on page load); mobile keeps store `isOpen`.
  const [railCollapsed, setRailCollapsed] = useState(true);
  const currentChapter = useDocumentStore((s) => s.currentChapter);
  const currentChapterText = useDocumentStore((s) => s.currentChapterText);
  const viewerPage = useDocumentStore((s) => s.viewerPage);
  const documents = useDocumentStore((s) => s.documents);
  const [input, setInput] = useState('');
  const [showSessionList, setShowSessionList] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);

  // ── @ mention state (Feature 3) ────────────────────────────────────────
  const location = useLocation();
  // Which learn-step page (if any) we're on — decides "Current page" mention
  // availability and the auto-attached learning-page context.
  const learningStepId = useMemo(() => {
    const m = /^\/learn\/steps\/([a-z0-9-]+)/i.exec(location.pathname);
    return m ? m[1] : null;
  }, [location.pathname]);
  const [attachedRefs, setAttachedRefs] = useState<MentionableItem[]>([]);
  const focusRefs = useChatStore((s) => s.focusRefs);
  const removeFocus = useChatStore((s) => s.removeFocus);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [textbooks, setTextbooks] = useState<Textbook[]>([]);

  // Build the list of mentionable items (documents + textbook chapters).
  // On learn-step pages the whole step already rides along automatically, so
  // the "Current page" reference would be redundant — offer it elsewhere.
  const mentionItems = useMemo<MentionableItem[]>(() => {
    const pageItem: MentionableItem[] = learningStepId
      ? []
      : [{ id: CURRENT_PAGE_REF_ID, name: 'Current page', type: 'page' as const }];
    const docItems: MentionableItem[] = documents.map((d) => ({
      id: d.id,
      name: d.name,
      type: 'document' as const,
    }));
    const chapterItems: MentionableItem[] = [];
    for (const tb of textbooks) {
      for (const doc of tb.documents) {
        chapterItems.push({
          id: doc.id,
          name: doc.name.replace(/^\d+\s+/, '').replace(/\.pdf$/i, '') || doc.name,
          type: 'chapter' as const,
          parentId: tb.id,
        });
      }
    }
    // De-duplicate by id (a doc might appear as both a document and a chapter)
    const seen = new Set<string>();
    return [...pageItem, ...docItems, ...chapterItems].filter((it) => {
      if (seen.has(it.id)) return false;
      seen.add(it.id);
      return true;
    });
  }, [learningStepId, documents, textbooks]);

  // Filtered + capped view of mention items for the popover.
  const filteredMentionItems = useMemo(() => {
    const q = mentionQuery.trim().toLowerCase();
    const base = q
      ? mentionItems.filter((it) => it.name.toLowerCase().includes(q))
      : mentionItems;
    return base.slice(0, 8);
  }, [mentionItems, mentionQuery]);

  // Keep the active highlight within bounds as the filtered list changes.
  // Derived on render instead of a setState-in-effect (lint: cascading renders).
  const clampedMentionIndex = filteredMentionItems.length
    ? mentionIndex % filteredMentionItems.length
    : 0;

  // Load textbooks once so chapter names are available for @ mentions.
  useEffect(() => {
    let cancelled = false;
    listTextbooks()
      .then((tbs) => {
        if (!cancelled) setTextbooks(tbs);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Unseen-reply dot, fully derived: messages.length is snapshotted into state
  // at collapse time (event handlers only — no setState-in-effect).
  const [seenCountAtCollapse, setSeenCountAtCollapse] = useState<number | null>(null);
  const unseenReply =
    railCollapsed && seenCountAtCollapse !== null && messages.length > seenCountAtCollapse;

  const collapseRail = useCallback(() => {
    setSeenCountAtCollapse(messages.length);
    setRailCollapsed(true);
  }, [messages.length]);
  const expandRail = useCallback(() => {
    setSeenCountAtCollapse(null);
    setRailCollapsed(false);
  }, []);
  const toggleRail = useCallback(() => {
    if (railCollapsed) expandRail();
    else collapseRail();
  }, [railCollapsed, collapseRail, expandRail]);

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Auto-scroll when messages or tool state changes
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingTools]);

  // Focus input when sidebar opens
  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  // (Send-to-AI no longer injects text — the selection becomes a focus chip
  // in the store; see focusRefs above.)

  // Autosize: height follows content on every value change (typing, wrap,
  // and programmatic drafts like "Send to AI"), clamped to maxHeight by CSS.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
    // Mirror overlay must scroll in lockstep with the textarea or the painted
    // @mention highlight (and its text) desyncs once content exceeds maxHeight.
    if (mirrorRef.current) mirrorRef.current.scrollTop = el.scrollTop;
  }, [input]);

  // Cmd/Ctrl+L to toggle chat
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        if (isMobile) {
          toggle();
        } else {
          toggleRail();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggle, isMobile, toggleRail]);

  // Current session title for header display
  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const sessionTitle = activeSession?.title === 'New chat' && messages.length > 0
    ? activeSession.title
    : (activeSession?.title ?? 'New chat');

  // Context label: course name on /courses/:id, 'Notes' on /notes, else 'Inkwell'.
  const courseMatch = location.pathname.match(/^\/courses\/([^/]+)/);
  const contextCourse = courseMatch
    ? courses.find((c) => c.id === decodeURIComponent(courseMatch[1])) ?? courses.find((c) => params.id === c.id)
    : undefined;
  const contextLabel = courseMatch
    ? (contextCourse?.name ?? 'Inkwell')
    : location.pathname.startsWith('/notes')
      ? 'Notes'
      : 'Inkwell';

  // Desktop rail visibility (collapse) — mobile keeps the original isOpen flow.
  const railOpen = isMobile ? isOpen : !railCollapsed;

  // ── @ mention input handling (Feature 3) ───────────────────────────────
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const caret = e.target.selectionStart ?? val.length;
    const before = val.slice(0, caret);
    const atIdx = before.lastIndexOf('@');
    if (atIdx !== -1) {
      const between = before.slice(atIdx + 1);
      // Only open the popover for an inline @query with no whitespace
      if (!/\s/.test(between) && (atIdx === 0 || /\s/.test(before[atIdx - 1]))) {
        setMentionOpen(true);
        setMentionQuery(between);
        setMentionIndex(0);
      } else {
        setMentionOpen(false);
      }
    } else {
      setMentionOpen(false);
    }
    setInput(val);
  };

  const handleMentionSelect = (item: MentionableItem) => {
    const val = input;
    const caret = inputRef.current?.selectionStart ?? val.length;
    const before = val.slice(0, caret);
    const atIdx = before.lastIndexOf('@');
    setMentionOpen(false);
    setMentionQuery('');
    if (atIdx === -1) return;
    const after = val.slice(caret);
    const mentionText = `@${item.name} `;
    const newVal = val.slice(0, atIdx) + mentionText + after;
    setInput(newVal);
    setAttachedRefs((prev) =>
      prev.some((r) => r.id === item.id) ? prev : [...prev, item],
    );
    // Refocus and place the caret right after the inserted mention
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) {
        const pos = atIdx + mentionText.length;
        el.focus();
        el.setSelectionRange(pos, pos);
      }
    });
  };

  const removeAttachedRef = (id: string) => {
    setAttachedRefs((prev) => prev.filter((r) => r.id !== id));
  };

  // ── Learning page context (Cursor-style file reference) ──────────────────
  // On a /learn/steps page, the whole step — metadata + active activity
  // content — is the "file" the student has open. (location + learningStepId
  // are derived up top with the mention state.)
  const learningStep = useLearningStore((s) =>
    learningStepId ? s.stepsById[learningStepId] : undefined,
  );
  const activeActivity = learningStep?.activities.find((a) => a.status === 'in_progress') ?? null;

  const activityText = useMemo(() => {
    const c = activeActivity?.content;
    if (!c) return null;
    // `in`-guards narrow the ActivityContent union without casts.
    if ('markdown' in c) return c.markdown;
    if ('questions' in c)
      return c.questions.map((q, i) => `${i + 1}. ${q.prompt}${q.options ? `\n   ${q.options.join(' | ')}` : ''}`).join('\n');
    if ('cards' in c) return c.cards.map((card) => `Q: ${card.front}\nA: ${card.back}`).join('\n\n');
    if ('rubric' in c) return `Prompt: ${c.prompt}\nRubric:\n${c.rubric.map((r) => `- ${r}`).join('\n')}`;
    if ('lines' in c) return c.lines.map((l) => `${l.speaker === 'host' ? 'Host' : 'Guest'}: ${l.text}`).join('\n');
    if ('messages' in c)
      return c.messages.map((m) => `${m.role === 'assistant' ? 'Tutor' : 'Student'}: ${m.content}`).join('\n\n');
    return null;
  }, [activeActivity]);

  /** Cap the activity text so one giant lesson can't blow up the prompt. */
  const LEARNING_TEXT_MAX = 12000;
  const learningPage = learningStep
    ? {
        stepId: learningStep.id,
        title: learningStep.title,
        courseName: learningStep.courseName,
        objectives: learningStep.objectives,
        keyPoints: learningStep.keyPoints,
        activityKind: activeActivity?.kind ?? null,
        activityLabel: activeActivity?.kind ?? null,
        activityText: activityText
          ? activityText.length > LEARNING_TEXT_MAX
            ? `${activityText.slice(0, LEARNING_TEXT_MAX)}\n… [truncated]`
            : activityText
          : null,
      }
    : null;

  const handleSend = useCallback(async () => {
    const msg = input.trim();
    if (!msg || isLoading) return;
    setInput('');
    setMentionOpen(false);

    const userMsg: ChatMessage = {
      id: generateUUID(),
      role: 'user',
      content: msg,
      timestamp: Date.now(),
    };
    addMessage(userMsg);
    setLoading(true);
    setPendingTools([]);

    try {
      const allMessages = useChatStore.getState().messages;

      const context: SystemMessageContext = {
        currentPage: window.location.pathname,
        currentDocumentName: currentDocument?.name,
        currentDocumentId: currentDocument?.id,
        currentChapter: currentChapter
          ? { id: currentChapter.id, title: currentChapter.title, parentId: currentChapter.parentId }
          : null,
        currentChapterId: currentChapter?.id ?? null,
        currentChapterText,
        viewerPage,
        attachedFileRefs:
          attachedRefs.length > 0
            ? attachedRefs.map((r) => ({ id: r.id, name: r.name, type: r.type }))
            : undefined,
        learningPage,
        focusExcerpt: focusRefs.length > 0 ? focusRefs.map((f) => f.excerpt).join(' … ') : null,
        // "@ Current page" — a snapshot of what's on screen right now.
        pageRef:
          attachedRefs.some((r) => r.id === CURRENT_PAGE_REF_ID)
            ? {
                path: window.location.pathname,
                title: document.title.replace(/\s*[|·-]\s*Inkwell\s*$/i, '').trim() || window.location.pathname,
                text: (document.querySelector('main')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
              }
            : null,
      };

      const result = await runAgentTurn(msg, allMessages.filter((m) => m.id !== userMsg.id), context, {
        onThinking: () => {},
        onToolStart: (name) => {
          const current = useChatStore.getState().pendingTools;
          const updated = current.map((t) =>
            t.status === 'running' ? { ...t, status: 'done' as const } : t,
          );
          updated.push({ name, status: 'running' });
          useChatStore.getState().setPendingTools(updated);
        },
        onToolEnd: (name, resultText) => {
          const current = useChatStore.getState().pendingTools;
          const updated = current.map((t) =>
            t.name === name && t.status === 'running'
              ? { ...t, status: 'done' as const, result: resultText.length > 300 ? resultText.slice(0, 300) + '…' : resultText }
              : t,
          );
          if (!updated.some((t) => t.name === name)) {
            updated.push({
              name,
              status: 'done',
              result: resultText.length > 300 ? resultText.slice(0, 300) + '…' : resultText,
            });
          }
          useChatStore.getState().setPendingTools(updated);
        },
      });

      setPendingTools([]);
      addMessage({
        id: generateUUID(),
        role: 'assistant',
        content: result.content,
        timestamp: Date.now(),
      });
    } catch (err) {
      setPendingTools([]);
      addMessage({
        id: generateUUID(),
        role: 'assistant',
        content: `Error: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: Date.now(),
      });
    }

    // Clear attached references after the message has been sent
    setAttachedRefs([]);
    setLoading(false);
  }, [input, isLoading, currentDocument, currentChapter, currentChapterText, viewerPage, attachedRefs, learningPage, focusRefs, addMessage, setLoading, setPendingTools]);

  // ── Mobile: edge pull tab + Broadsheet sidebar ────────────────────────────
  if (isMobile) {
    return (
      <>
        {/* Edge pull tab — click to pull out the chat sidebar */}
        {!isOpen && (
          <button
            onClick={toggle}
            className="fixed right-0 top-1/2 z-40 flex h-16 w-7 -translate-y-1/2 items-center justify-center transition-colors hover:text-[var(--color-accent)]"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-divider)',
              borderRight: 'none',
              borderRadius: 'var(--radius-md) 0 0 var(--radius-md)',
              boxShadow: 'var(--shadow-md)',
              color: 'var(--color-neutral-600)',
            }}
            aria-label="Open chat"
            title="Chat — ⌘L"
          >
            <HiChatAlt2 className="h-4 w-4" />
          </button>
        )}

        {/* Sidebar */}
        <div
          className={`fixed inset-y-0 right-0 z-50 flex flex-col w-96 max-w-[100vw] transition-transform duration-300 ease-in-out ${
            isOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
          style={{
            background: 'var(--color-surface)',
            borderLeft: '1px solid var(--color-divider)',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 shrink-0"
            style={{ borderBottom: '1px solid var(--color-divider)' }}
          >
            <div className="relative">
              <button
                onClick={() => setShowSessionList((v) => !v)}
                className="text-sm font-semibold flex items-center gap-1.5 hover:text-[var(--color-accent)] transition-colors"
              >
                💬 {sessionTitle}
                <HiChevronDown className={`w-3.5 h-3.5 transition-transform ${showSessionList ? 'rotate-180' : ''}`} />
              </button>
              {currentDocument && (
                <span className="block text-xs font-normal ml-5 mt-0.5" style={{ opacity: 0.6 }}>
                  · {currentDocument.name}
                </span>
              )}
              {showSessionList && (
                <SessionListDropdown
                  sessions={sessions}
                  activeSessionId={activeSessionId}
                  onSelect={setActiveSession}
                  onNew={() => {
                    createNewSession();
                    setShowSessionList(false);
                  }}
                  onDelete={deleteSession}
                  onClose={() => setShowSessionList(false)}
                />
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={createNewSession}
                className="p-1.5 text-[var(--color-neutral-600)] hover:text-[var(--color-text)] hover:bg-[var(--color-neutral-200)] rounded-[var(--radius-md)] transition-colors"
                title="New chat"
              >
                <HiPlus className="w-4 h-4" />
              </button>
              <button
                onClick={close}
                className="p-1.5 text-[var(--color-neutral-600)] hover:text-[var(--color-text)] hover:bg-[var(--color-neutral-200)] rounded-[var(--radius-md)] transition-colors"
              >
                <HiX className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-center py-16" style={{ opacity: 0.5 }}>
                <p className="text-lg mb-2">💬 Ask anything</p>
                <p className="text-sm">
                  {currentDocument
                    ? `Asking about "${currentDocument.name}"`
                    : 'Open a document to chat with context'}
                </p>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] text-sm ${
                    msg.role === 'user' ? 'px-4 py-3 whitespace-pre-wrap' : ''
                  }`}
                  style={
                    msg.role === 'user'
                      ? {
                          background: 'var(--color-accent)',
                          color: 'var(--color-bg)',
                          borderRadius: 'var(--radius-lg)',
                        }
                      : undefined
                  }
                >
                  {msg.role === 'user' ? msg.content : <Markdown content={normalizeMathText(msg.content)} />}
                </div>
              </div>
            ))}

            {isLoading && <ToolProgressIndicator />}
            <ToolCallSummary />
            {isLoading && pendingTools.length === 0 && (
              <div className="flex justify-start">
                <div className="px-1 py-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--color-neutral-500)', animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--color-neutral-500)', animationDelay: '150ms' }} />
                    <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--color-neutral-500)', animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={endRef} />
          </div>

          {/* Input */}
          <div className="p-3 shrink-0" style={{ borderTop: '1px solid var(--color-divider)' }}>
            {/* Attached @ references (Feature 3) */}
            {attachedRefs.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {attachedRefs.map((ref) => (
                  <span
                    key={ref.id}
                    className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 text-xs"
                    style={{
                      background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--color-accent) 40%, transparent)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--color-accent-700)',
                    }}
                  >
                    {ref.type === 'chapter' ? (
                      <HiBookOpen className="w-3 h-3 shrink-0" />
                    ) : ref.type === 'page' ? (
                      <HiOutlineEye className="w-3 h-3 shrink-0" />
                    ) : (
                      <HiDocumentText className="w-3 h-3 shrink-0" />
                    )}
                    <span className="truncate max-w-[180px]">{ref.name}</span>
                    <button
                      type="button"
                      onClick={() => removeAttachedRef(ref.id)}
                      className="p-0.5 rounded-[var(--radius-sm)] hover:bg-[color-mix(in_srgb,var(--color-accent)_25%,transparent)] transition-colors"
                      title="Remove reference"
                    >
                      <HiX className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              {/* Highlighted @-mention input (Feature 3) */}
              <div
                className="relative flex-1 border border-[var(--color-divider)] focus-within:border-[var(--color-accent)] transition-colors"
                style={{
                  background: 'var(--color-bg)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                {/* Mirror: paints ONLY the @mention highlight boxes — its base
                    text is transparent so the real (textarea) glyphs are the
                    only ones ever drawn. Guarantees the old double-render bug
                    (mirror/textarea metric drift) can never come back. */}
                <div
                  ref={mirrorRef}
                  aria-hidden="true"
                  className="absolute inset-0 px-4 py-2 text-base leading-[1.5] whitespace-break-spaces break-words overflow-hidden pointer-events-none !text-transparent"
                >
                  {input.split(/(@\S+)/g).map((part, i) =>
                    part.startsWith('@') ? (
                      <span
                        key={i}
                        className="rounded-[3px]"
                        style={{
                          background: 'color-mix(in srgb, var(--color-accent) 18%, transparent)',
                          boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--color-accent) 45%, transparent)',
                        }}
                      >
                        {part}
                      </span>
                    ) : (
                      <span key={i}>{part}</span>
                    ),
                  )}
                </div>
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={(e) => {
                    if (mentionOpen && filteredMentionItems.length > 0) {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setMentionIndex((i) => (i + 1) % filteredMentionItems.length);
                        return;
                      }
                      if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setMentionIndex(
                          (i) => (i - 1 + filteredMentionItems.length) % filteredMentionItems.length,
                        );
                        return;
                      }
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleMentionSelect(filteredMentionItems[clampedMentionIndex]);
                        return;
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setMentionOpen(false);
                        return;
                      }
                    }
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault(); // textarea would otherwise insert a newline
                      handleSend();
                    }
                  }}
                  onScroll={(e) => {
                    // Wheel/arrow scrolling desyncs the overlay too — sync on
                    // every scroll event, not just value changes.
                    if (mirrorRef.current) mirrorRef.current.scrollTop = e.currentTarget.scrollTop;
                  }}
                  placeholder={currentDocument ? 'Ask about this document… (@ to reference)' : 'Ask a question… (@ to reference)'}
                  className="relative w-full px-4 py-2 bg-transparent border-0 text-sm leading-[1.5] placeholder:text-[var(--color-neutral-500)] focus:outline-none resize-none overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  style={{
                    color: 'var(--color-text)',
                    caretColor: 'var(--color-accent)',
                    borderRadius: 'var(--radius-md)',
                    minHeight: '2.5rem',
                    maxHeight: '10rem',
                  }}
                />
                {mentionOpen && (
                  <MentionPopover
                    items={filteredMentionItems}
                    activeIndex={clampedMentionIndex}
                    onSelect={handleMentionSelect}
                    onClose={() => setMentionOpen(false)}
                  />
                )}
              </div>
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="btn btn-primary shrink-0 transition-colors"
                style={{ padding: 8 }}
              >
                <HiPaperAirplane className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Backdrop on mobile */}
        {isOpen && (
          <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={close} />
        )}
      </>
    );
  }

  // ── Desktop: Tutor rail ──────────────────────────────────────────────────
  const collapsed = railCollapsed;

  const chatBody = (
    <>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0 gap-2"
        style={{ borderBottom: '1px solid var(--color-divider)' }}
      >
        <div className="relative min-w-0 flex-1">
          <button
            onClick={() => setShowSessionList((v) => !v)}
            className="text-sm font-semibold flex items-center gap-1.5 hover:text-[var(--color-accent)] transition-colors min-w-0"
          >
            Tutor
            <HiChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${showSessionList ? 'rotate-180' : ''}`} />
          </button>
          <span className="block text-xs truncate mt-0.5" style={{ opacity: 0.6 }}>{contextLabel}</span>
          {showSessionList && (
            <SessionListDropdown
              sessions={sessions}
              activeSessionId={activeSessionId}
              onSelect={setActiveSession}
              onNew={() => {
                createNewSession();
                setShowSessionList(false);
              }}
              onDelete={deleteSession}
              onClose={() => setShowSessionList(false)}
            />
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={createNewSession}
            className="p-1.5 text-[var(--color-neutral-600)] hover:text-[var(--color-text)] hover:bg-[var(--color-neutral-200)] rounded-[var(--radius-md)] transition-colors"
            title="New chat"
          >
            <HiPlus className="w-4 h-4" />
          </button>
          <button
            onClick={collapseRail}
            className="p-1.5 text-[var(--color-neutral-600)] hover:text-[var(--color-text)] hover:bg-[var(--color-neutral-200)] rounded-[var(--radius-md)] transition-colors"
            title="Collapse Tutor rail"
            aria-label="Collapse Tutor rail"
          >
            <HiChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-16" style={{ opacity: 0.5 }}>
            <p className="text-lg mb-2">💬 Ask your tutor</p>
            <p className="text-sm">
              {currentDocument
                ? `Asking about "${currentDocument.name}"`
                : 'Open a document to chat with context'}
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] text-sm ${
                msg.role === 'user' ? 'px-4 py-3 whitespace-pre-wrap' : ''
              }`}
              style={
                msg.role === 'user'
                  ? {
                      background: 'var(--color-accent)',
                      color: 'var(--color-bg)',
                      borderRadius: 'var(--radius-lg)',
                    }
                  : undefined
              }
            >
              {msg.role === 'user' ? msg.content : <Markdown content={normalizeMathText(msg.content)} />}
            </div>
          </div>
        ))}

        {isLoading && <ToolProgressIndicator />}
        <ToolCallSummary />
        {isLoading && pendingTools.length === 0 && (
          <div className="flex justify-start">
            <div className="px-1 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--color-neutral-500)', animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--color-neutral-500)', animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--color-neutral-500)', animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="p-3 shrink-0" style={{ borderTop: '1px solid var(--color-divider)' }}>
        {/* Focus chips — selections attached via "Send to AI" (Cursor-style):
            they tell the AI what to look at; the page rides in the prompt. */}
        {focusRefs.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {focusRefs.map((f) => (
              <span
                key={f.id}
                className="inline-flex items-center gap-1.5 pl-2 pr-1 py-0.5 text-xs max-w-full"
                style={{
                  background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--color-accent) 40%, transparent)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--color-accent-700)',
                }}
                title={f.excerpt}
              >
                <HiOutlineSparkles className="w-3 h-3 shrink-0" />
                <span className="truncate italic">"{f.excerpt}"</span>
                <button
                  type="button"
                  onClick={() => removeFocus(f.id)}
                  className="p-0.5 rounded-[var(--radius-sm)] hover:bg-[color-mix(in_srgb,var(--color-accent)_25%,transparent)] transition-colors shrink-0"
                  title="Remove focus"
                >
                  <HiX className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Attached @ references (Feature 3) */}
        {attachedRefs.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {attachedRefs.map((ref) => (
              <span
                key={ref.id}
                className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 text-xs"
                style={{
                  background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--color-accent) 40%, transparent)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--color-accent-700)',
                }}
              >
                {ref.type === 'chapter' ? (
                  <HiBookOpen className="w-3 h-3 shrink-0" />
                ) : ref.type === 'page' ? (
                  <HiOutlineEye className="w-3 h-3 shrink-0" />
                ) : (
                  <HiDocumentText className="w-3 h-3 shrink-0" />
                )}
                <span className="truncate max-w-[180px]">{ref.name}</span>
                <button
                  type="button"
                  onClick={() => removeAttachedRef(ref.id)}
                  className="p-0.5 rounded-[var(--radius-sm)] hover:bg-[color-mix(in_srgb,var(--color-accent)_25%,transparent)] transition-colors"
                  title="Remove reference"
                >
                  <HiX className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          {/* Highlighted @-mention input (Feature 3) */}
          <div
            className="relative flex-1 border border-[var(--color-divider)] focus-within:border-[var(--color-accent)] transition-colors"
            style={{
              background: 'var(--color-bg)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            {/* Mirror: paints ONLY the @mention highlight boxes — its base
                text is transparent so the real (textarea) glyphs are the
                only ones ever drawn. Guarantees the old double-render bug
                (mirror/textarea metric drift) can never come back. */}
            <div
              ref={mirrorRef}
              aria-hidden="true"
              className="absolute inset-0 px-4 py-2 text-base leading-[1.5] whitespace-break-spaces break-words overflow-hidden pointer-events-none !text-transparent"
            >
              {input.split(/(@\S+)/g).map((part, i) =>
                part.startsWith('@') ? (
                  <span
                    key={i}
                    className="rounded-[3px]"
                    style={{
                      background: 'color-mix(in srgb, var(--color-accent) 18%, transparent)',
                      boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--color-accent) 45%, transparent)',
                    }}
                  >
                    {part}
                  </span>
                ) : (
                  <span key={i}>{part}</span>
                ),
              )}
            </div>
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={handleInputChange}
              onKeyDown={(e) => {
                if (mentionOpen && filteredMentionItems.length > 0) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setMentionIndex((i) => (i + 1) % filteredMentionItems.length);
                    return;
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setMentionIndex(
                      (i) => (i - 1 + filteredMentionItems.length) % filteredMentionItems.length,
                    );
                    return;
                  }
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleMentionSelect(filteredMentionItems[clampedMentionIndex]);
                    return;
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setMentionOpen(false);
                    return;
                  }
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault(); // textarea would otherwise insert a newline
                  handleSend();
                }
              }}
              onScroll={(e) => {
                // Wheel/arrow scrolling desyncs the overlay too — sync on
                // every scroll event, not just value changes.
                if (mirrorRef.current) mirrorRef.current.scrollTop = e.currentTarget.scrollTop;
              }}
              placeholder={currentDocument ? 'Ask about this document… (@ to reference)' : 'Ask a question… (@ to reference)'}
              className="relative w-full px-4 py-2 bg-transparent border-0 text-sm leading-[1.5] placeholder:text-[var(--color-neutral-500)] focus:outline-none resize-none overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              style={{
                color: 'var(--color-text)',
                caretColor: 'var(--color-accent)',
                borderRadius: 'var(--radius-md)',
                minHeight: '2.5rem',
                maxHeight: '10rem',
              }}
            />
            {mentionOpen && (
              <MentionPopover
                items={filteredMentionItems}
                activeIndex={clampedMentionIndex}
                onSelect={handleMentionSelect}
                onClose={() => setMentionOpen(false)}
              />
            )}
          </div>
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="btn btn-primary shrink-0 transition-colors"
            style={{ padding: 8 }}
          >
            <HiPaperAirplane className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Collapsed rail strip */}
      <div
        className={`fixed inset-y-0 right-0 z-50 flex flex-col items-center overflow-hidden transition-all duration-300 ease-in-out ${
          collapsed ? 'w-[52px] opacity-100' : 'w-0 opacity-0 pointer-events-none'
        }`}
        style={{
          background: 'var(--color-surface)',
          borderLeft: '1px solid var(--color-divider)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <button
          onClick={expandRail}
          className="relative mt-4 flex flex-col items-center justify-center gap-2 transition-colors hover:text-[var(--color-accent)]"
          style={{ color: 'var(--color-neutral-600)' }}
          title="Expand Tutor rail"
          aria-label="Expand Tutor rail"
        >
          <HiChevronLeft className="w-4 h-4" />
          <span
            className="text-[11px] font-semibold tracking-widest"
            style={{ writingMode: 'vertical-rl', color: 'var(--color-neutral-600)' }}
          >
            TUTOR
          </span>
          {unseenReply && (
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--color-accent)' }} aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Open rail */}
      <div
        className={`fixed inset-y-0 right-0 z-50 flex flex-col overflow-hidden transition-all duration-300 ease-in-out ${
          railOpen ? 'w-[320px] opacity-100' : 'w-0 opacity-0 pointer-events-none'
        }`}
        style={{
          background: 'var(--color-surface)',
          borderLeft: '1px solid var(--color-divider)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        {chatBody}
      </div>
    </>
  );
}
