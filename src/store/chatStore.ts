import { create } from 'zustand';
import { ChatMessage, ChatSession } from '../types/chat';
import { listChatSessions, getChatSession, createChatSession, updateChatSession, addChatMessage, deleteChatSession } from '../services/api/client';
import { generateUUID } from '../utils/uuid';

interface PendingTool {
  name: string;
  status: 'running' | 'done' | 'error';
  result?: string;
}

interface ChatState {
  isOpen: boolean;
  messages: ChatMessage[];
  isLoading: boolean;
  pendingTools: PendingTool[];
  sessions: ChatSession[];
  activeSessionId: string | null;
  isLoadingSessions: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  addMessage: (msg: ChatMessage) => void;
  setLoading: (loading: boolean) => void;
  setPendingTools: (tools: PendingTool[]) => void;
  clearMessages: () => void;
  loadSessions: () => Promise<void>;
  setActiveSession: (id: string) => Promise<void>;
  createNewSession: () => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
}

export type { PendingTool };

export const useChatStore = create<ChatState>()((set, get) => ({
  isOpen: false,
  messages: [],
  isLoading: false,
  pendingTools: [],
  sessions: [],
  activeSessionId: null,
  isLoadingSessions: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),

  addMessage: (msg) => {
    const state = get();
    set((s) => ({ messages: [...s.messages, msg] }));

    // Auto-generate title from first user message
    if (msg.role === 'user' && state.messages.length === 0 && state.activeSessionId) {
      const title = msg.content.length > 50 ? msg.content.slice(0, 50) + '…' : msg.content;
      set((s) => ({
        sessions: s.sessions.map((ses) =>
          ses.id === s.activeSessionId ? { ...ses, title, updatedAt: Date.now() } : ses,
        ),
      }));
      // Persist title update
      updateChatSession(state.activeSessionId, { title }).catch(console.error);
    }

    // Persist message to API (fire-and-forget)
    if (state.activeSessionId) {
      addChatMessage(state.activeSessionId, {
        id: msg.id,
        role: msg.role,
        content: msg.content,
        citations: msg.citations,
      }).catch(console.error);
    }
  },

  setLoading: (isLoading) => set({ isLoading }),
  setPendingTools: (pendingTools) => set({ pendingTools }),

  clearMessages: () => {
    set({ messages: [], pendingTools: [] });
  },

  loadSessions: async () => {
    set({ isLoadingSessions: true });
    try {
      const sessions = await listChatSessions();
      set({ sessions });

      if (sessions.length > 0) {
        const mostRecent = sessions[0];
        // Load messages for the most recent session
        try {
          const full = await getChatSession(mostRecent.id);
          set({ activeSessionId: mostRecent.id, messages: full.messages });
        } catch {
          set({ activeSessionId: mostRecent.id, messages: [] });
        }
      } else {
        // No sessions — create one
        const created = await createChatSession();
        set({ sessions: [created], activeSessionId: created.id, messages: [] });
      }
    } catch (err) {
      console.error('Failed to load chat sessions:', err);
    } finally {
      set({ isLoadingSessions: false });
    }
  },

  setActiveSession: async (id) => {
    const state = get();
    const session = state.sessions.find((s) => s.id === id);
    if (!session) return;

    set({ activeSessionId: id, pendingTools: [] });
    // Load messages from API
    try {
      const full = await getChatSession(id);
      set({ messages: full.messages });
    } catch {
      set({ messages: [] });
    }
  },

  createNewSession: async () => {
    try {
      const created = await createChatSession();
      set((s) => ({
        sessions: [created, ...s.sessions],
        activeSessionId: created.id,
        messages: [],
        pendingTools: [],
      }));
    } catch (err) {
      console.error('Failed to create chat session:', err);
    }
  },

  deleteSession: async (id) => {
    try {
      await deleteChatSession(id);
      const state = get();
      const remaining = state.sessions.filter((s) => s.id !== id);

      if (state.activeSessionId === id) {
        if (remaining.length > 0) {
          const next = remaining[0];
          set({
            sessions: remaining,
            activeSessionId: next.id,
            pendingTools: [],
          });
          // Load messages for the next session
          try {
            const full = await getChatSession(next.id);
            set({ messages: full.messages });
          } catch {
            set({ messages: [] });
          }
        } else {
          // No sessions left — create a new one
          const created = await createChatSession();
          set({ sessions: [created], activeSessionId: created.id, messages: [], pendingTools: [] });
        }
      } else {
        set({ sessions: remaining });
      }
    } catch (err) {
      console.error('Failed to delete chat session:', err);
    }
  },
}));
