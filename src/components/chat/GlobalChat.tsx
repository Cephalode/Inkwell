import { useState, useRef, useEffect, useCallback, type ComponentPropsWithoutRef } from 'react';
import { HiPaperAirplane, HiX, HiChatAlt2, HiPlus, HiChevronDown, HiClock } from 'react-icons/hi';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useChatStore } from '../../store/chatStore';
import { useDocumentStore } from '../../store/documentStore';
import { runAgentTurn, type SystemMessageContext } from '../../services/chat/agent';
import { generateUUID } from '../../utils/uuid';
import type { ChatMessage, ChatSession } from '../../types/chat';

// ── Markdown prose renderer ─────────────────────────────────────────────────

const markdownComponents: ComponentPropsWithoutRef<typeof ReactMarkdown>['components'] = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="list-disc list-outside ml-4 mb-2 space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal list-outside ml-4 mb-2 space-y-0.5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  h1: ({ children }) => <h1 className="text-base font-bold mb-1 mt-2">{children}</h1>,
  h2: ({ children }) => <h2 className="text-sm font-bold mb-1 mt-2">{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-semibold mb-1 mt-1">{children}</h3>,
  blockquote: ({ children }) => <blockquote className="border-l-2 border-slate-500 pl-3 my-2 text-slate-300 italic">{children}</blockquote>,
  code: ({ children, className }) => {
    const isBlock = className?.includes('language-');
    if (isBlock) {
      return <code className={`${className} block bg-slate-800 rounded-lg p-3 my-2 text-xs overflow-x-auto`}>{children}</code>;
    }
    return <code className="bg-slate-600/50 px-1 py-0.5 rounded text-xs font-mono">{children}</code>;
  },
  pre: ({ children }) => <pre className="my-2">{children}</pre>,
  a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline hover:text-cyan-300">{children}</a>,
  table: ({ children }) => <table className="w-full border-collapse my-2 text-xs">{children}</table>,
  th: ({ children }) => <th className="border border-slate-600 px-2 py-1 bg-slate-700/50 font-semibold text-left">{children}</th>,
  td: ({ children }) => <td className="border border-slate-600 px-2 py-1">{children}</td>,
  hr: () => <hr className="border-slate-600 my-3" />,
  strong: ({ children }) => <strong className="font-bold text-slate-100">{children}</strong>,
};

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="prose-invert max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

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

  const doneCount = pendingTools.filter((t) => t.status === 'done').length;
  const errorCount = pendingTools.filter((t) => t.status === 'error').length;
  const stillRunning = pendingTools.some((t) => t.status === 'running');

  return (
    <div className="flex justify-start">
      <div
        className={`max-w-[85%] rounded-xl px-4 py-2 text-sm border ${
          stillRunning
            ? 'bg-slate-700/50 border-slate-600 text-slate-300'
            : 'bg-slate-800 border-slate-700 text-slate-300'
        }`}
      >
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-2 w-full text-left hover:text-white transition-colors"
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
            <span className="text-xs text-red-400">({errorCount} error{errorCount > 1 ? 's' : ''})</span>
          )}
          <span className="text-xs ml-auto text-slate-500">{expanded ? '▲' : '▼'}</span>
        </button>

        {expanded && (
          <div className="mt-2 space-y-1.5 pl-1 border-l-2 border-slate-600 ml-1">
            {pendingTools.map((tool, i) => (
              <div key={i} className="pl-3 py-1">
                <div className="flex items-center gap-2 text-xs">
                  {tool.status === 'running' ? (
                    <Spinner className="w-3 h-3" />
                  ) : tool.status === 'done' ? (
                    <span className="text-green-400">✓</span>
                  ) : (
                    <span className="text-red-400">✗</span>
                  )}
                  <span className="font-medium">{getToolDisplayLabel(tool.name)}</span>
                </div>
                {tool.result && (
                  <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{tool.result}</p>
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
  const runningTool = pendingTools.findLast((t) => t.status === 'running');
  if (!runningTool) return null;

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-xl px-4 py-3 text-sm bg-cyan-900/30 border border-cyan-700/30 text-cyan-300 flex items-center gap-2">
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
      className="absolute top-full left-0 mt-1 w-72 bg-slate-800 border border-slate-600/50 rounded-xl shadow-xl z-50 overflow-hidden"
    >
      <button
        onClick={onNew}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-cyan-400 hover:bg-slate-700/50 transition-colors border-b border-slate-700/50"
      >
        <HiPlus className="w-4 h-4" />
        New chat
      </button>
      <div className="max-h-64 overflow-y-auto">
        {sessions.length === 0 ? (
          <div className="px-3 py-4 text-sm text-slate-500 text-center">No sessions yet</div>
        ) : (
          sessions.map((session) => (
            <div
              key={session.id}
              className={`group flex items-start gap-2 px-3 py-2.5 text-sm cursor-pointer transition-colors ${
                session.id === activeSessionId
                  ? 'bg-slate-700/60 text-white'
                  : 'text-slate-300 hover:bg-slate-700/30'
              }`}
              onClick={() => {
                onSelect(session.id);
                onClose();
              }}
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">
                  {session.title === 'New chat' ? 'New chat' : session.title}
                </div>
                <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
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
                className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-500 hover:text-red-400 transition-all shrink-0"
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
  const [input, setInput] = useState('');
  const [showSessionList, setShowSessionList] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const handleSend = useCallback(async () => {
    const msg = input.trim();
    if (!msg || isLoading) return;
    setInput('');

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
    } catch (err: any) {
      setPendingTools([]);
      addMessage({
        id: generateUUID(),
        role: 'assistant',
        content: `Error: ${err.message}`,
        timestamp: Date.now(),
      });
    }

    setLoading(false);
  }, [input, isLoading, currentDocument, addMessage, setLoading, setPendingTools]);

  return (
    <>
      {/* FAB button */}
      {!isOpen && (
        <button
          onClick={toggle}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-cyan-600 hover:bg-cyan-500 text-white rounded-full shadow-lg shadow-cyan-600/30 flex items-center justify-center transition-all hover:scale-110"
          aria-label="Open chat"
        >
          <HiChatAlt2 className="w-7 h-7" />
        </button>
      )}

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 right-0 z-50 flex flex-col w-96 max-w-[100vw] bg-slate-900 border-l border-slate-700/50 shadow-2xl transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50 shrink-0">
          <div className="relative">
            <button
              onClick={() => setShowSessionList((v) => !v)}
              className="text-sm font-semibold text-white flex items-center gap-1.5 hover:text-cyan-400 transition-colors"
            >
              💬 {sessionTitle}
              <HiChevronDown className={`w-3.5 h-3.5 transition-transform ${showSessionList ? 'rotate-180' : ''}`} />
            </button>
            {currentDocument && (
              <span className="block text-xs text-slate-400 font-normal ml-5 mt-0.5">
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
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 rounded-md transition-colors"
              title="New chat"
            >
              <HiPlus className="w-4 h-4" />
            </button>
            <button
              onClick={close}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 rounded-md transition-colors"
            >
              <HiX className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-slate-500 py-16">
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
                className={`max-w-[85%] rounded-xl px-4 py-3 text-sm ${
                  msg.role === 'user'
                    ? 'bg-cyan-600 text-white whitespace-pre-wrap'
                    : 'bg-slate-700 text-slate-200'
                }`}
              >
                {msg.role === 'user' ? msg.content : <MarkdownContent content={msg.content} />}
              </div>
            </div>
          ))}

          {isLoading && <ToolProgressIndicator />}
          <ToolCallSummary />
          {isLoading && pendingTools.length === 0 && (
            <div className="flex justify-start">
              <div className="bg-slate-700 rounded-xl px-4 py-3">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* Input */}
        <div className="p-3 border-t border-slate-700/50 shrink-0">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder={currentDocument ? 'Ask about this document...' : 'Ask a question...'}
              className="flex-1 px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="p-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
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
