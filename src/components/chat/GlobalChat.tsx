import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { HiPaperAirplane, HiX, HiChatAlt2, HiPlus, HiChevronDown, HiClock, HiBookOpen, HiDocumentText } from 'react-icons/hi';
import Markdown from '../shared/Markdown';
import { useChatStore } from '../../store/chatStore';
import { useDocumentStore } from '../../store/documentStore';
import { runAgentTurn, type SystemMessageContext } from '../../services/chat/agent';
import { generateUUID } from '../../utils/uuid';
import { listTextbooks } from '../../services/api/client';
import MentionPopover, { type MentionableItem } from './MentionPopover';
import type { ChatMessage, ChatSession } from '../../types/chat';
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
  const currentChapter = useDocumentStore((s) => s.currentChapter);
  const currentChapterText = useDocumentStore((s) => s.currentChapterText);
  const viewerPage = useDocumentStore((s) => s.viewerPage);
  const documents = useDocumentStore((s) => s.documents);
  const [input, setInput] = useState('');
  const [showSessionList, setShowSessionList] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── @ mention state (Feature 3) ────────────────────────────────────────
  const [attachedRefs, setAttachedRefs] = useState<MentionableItem[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [textbooks, setTextbooks] = useState<Textbook[]>([]);

  // Build the list of mentionable items (documents + textbook chapters).
  const mentionItems = useMemo<MentionableItem[]>(() => {
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
    return [...docItems, ...chapterItems].filter((it) => {
      if (seen.has(it.id)) return false;
      seen.add(it.id);
      return true;
    });
  }, [documents, textbooks]);

  // Filtered + capped view of mention items for the popover.
  const filteredMentionItems = useMemo(() => {
    const q = mentionQuery.trim().toLowerCase();
    const base = q
      ? mentionItems.filter((it) => it.name.toLowerCase().includes(q))
      : mentionItems;
    return base.slice(0, 8);
  }, [mentionItems, mentionQuery]);

  // Keep the active highlight within bounds as the filtered list changes.
  useEffect(() => {
    if (mentionIndex >= filteredMentionItems.length) {
      setMentionIndex(0);
    }
  }, [filteredMentionItems.length, mentionIndex]);

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

  // Cmd/Ctrl+L to toggle chat
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggle]);

  // Current session title for header display
  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const sessionTitle = activeSession?.title === 'New chat' && messages.length > 0
    ? activeSession.title
    : (activeSession?.title ?? 'New chat');

  // ── @ mention input handling (Feature 3) ───────────────────────────────
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
  }, [input, isLoading, currentDocument, currentChapter, currentChapterText, viewerPage, attachedRefs, addMessage, setLoading, setPendingTools]);

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
                {msg.role === 'user' ? msg.content : <Markdown content={msg.content} />}
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
              {/* Mirror: renders the value with @mentions highlighted in cyan,
                  positioned behind a transparent input so the caret/typing
                  is handled by the real input while styling comes from here. */}
              <div
                aria-hidden="true"
                className="absolute inset-0 px-4 py-2 text-sm leading-[1.5] whitespace-pre overflow-hidden pointer-events-none"
              >
                {input.split(/(@\S+)/g).map((part, i) =>
                  part.startsWith('@') ? (
                    <span key={i} className="font-medium" style={{ color: 'var(--color-accent)' }}>{part}</span>
                  ) : (
                    <span key={i}>{part}</span>
                  ),
                )}
              </div>
              <input
                ref={inputRef}
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
                      handleMentionSelect(filteredMentionItems[mentionIndex]);
                      return;
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setMentionOpen(false);
                      return;
                    }
                  }
                  if (e.key === 'Enter' && !e.shiftKey) {
                    handleSend();
                  }
                }}
                placeholder={currentDocument ? 'Ask about this document… (@ to reference)' : 'Ask a question… (@ to reference)'}
                className="relative w-full px-4 py-2 bg-transparent border-0 text-sm text-transparent placeholder:text-[var(--color-neutral-500)] focus:outline-none"
                style={{ caretColor: 'var(--color-accent)', borderRadius: 'var(--radius-md)' }}
              />
              {mentionOpen && (
                <MentionPopover
                  items={filteredMentionItems}
                  activeIndex={mentionIndex}
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
