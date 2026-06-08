import { create } from 'zustand';
import { ChatMessage, ChatSession } from '../types/chat';
import * as chatDB from '../services/storage/chatStore';
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
  open: () => void;
  close: () => void;
  toggle: () => void;
  addMessage: (msg: ChatMessage) => void;
  setLoading: (loading: boolean) => void;
  setPendingTools: (tools: PendingTool[]) => void;
  clearMessages: () => void;
  loadSessions: () => Promise<void>;
  setActiveSession: (id: string) => void;
  createNewSession: () => void;
  deleteSession: (id: string) => void;
  persistSession: () => Promise<void>;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

export type { PendingTool };

export const useChatStore = create<ChatState>()((set, get) => ({
  isOpen: false,
  messages: [],
  isLoading: false,
  pendingTools: [],
  sessions: [],
  activeSessionId: null,
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
      const session = get().sessions.find((s) => s.id === get().activeSessionId);
      if (session) {
        chatDB.saveSession({ ...session, title, updatedAt: Date.now() });
      }
    }

    // Debounced persist (300ms)
    if (state.activeSessionId) {
      if (persistTimer) clearTimeout(persistTimer);
      persistTimer = setTimeout(() => {
        get().persistSession();
        persistTimer = null;
      }, 300);
    }
  },

  setLoading: (isLoading) => set({ isLoading }),
  setPendingTools: (pendingTools) => set({ pendingTools }),

  clearMessages: () => {
    set({ messages: [], pendingTools: [] });
    // Persist empty messages to current session
    const state = get();
    if (state.activeSessionId) {
      const session = state.sessions.find((s) => s.id === state.activeSessionId);
      if (session) {
        chatDB.saveSession({ ...session, messages: [], updatedAt: Date.now() });
      }
    }
  },

  loadSessions: async () => {
    const sessions = await chatDB.getAllSessions();
    set({ sessions });

    // Set the most recent session as active and load its messages
    if (sessions.length > 0) {
      const mostRecent = sessions[0];
      set({ activeSessionId: mostRecent.id, messages: mostRecent.messages });
    } else {
      // Create an initial session
      const now = Date.now();
      const newSession: ChatSession = {
        id: generateUUID(),
        title: 'New chat',
        messages: [],
        createdAt: now,
        updatedAt: now,
      };
      await chatDB.saveSession(newSession);
      set({ sessions: [newSession], activeSessionId: newSession.id, messages: [] });
    }
  },

  setActiveSession: (id) => {
    const state = get();
    const session = state.sessions.find((s) => s.id === id);
    if (session) {
      set({ activeSessionId: id, messages: session.messages, pendingTools: [] });
    }
  },

  createNewSession: () => {
    const now = Date.now();
    const newSession: ChatSession = {
      id: generateUUID(),
      title: 'New chat',
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    chatDB.saveSession(newSession);
    set((s) => ({
      sessions: [newSession, ...s.sessions],
      activeSessionId: newSession.id,
      messages: [],
      pendingTools: [],
    }));
  },

  deleteSession: (id) => {
    const state = get();
    chatDB.deleteSession(id);
    const remaining = state.sessions.filter((s) => s.id !== id);

    if (state.activeSessionId === id) {
      if (remaining.length > 0) {
        const next = remaining[0];
        set({
          sessions: remaining,
          activeSessionId: next.id,
          messages: next.messages,
          pendingTools: [],
        });
      } else {
        // No sessions left — create a new one
        const now = Date.now();
        const fresh: ChatSession = {
          id: generateUUID(),
          title: 'New chat',
          messages: [],
          createdAt: now,
          updatedAt: now,
        };
        chatDB.saveSession(fresh);
        set({ sessions: [fresh], activeSessionId: fresh.id, messages: [], pendingTools: [] });
      }
    } else {
      set({ sessions: remaining });
    }
  },

  persistSession: async () => {
    const state = get();
    if (!state.activeSessionId) return;
    const session = state.sessions.find((s) => s.id === state.activeSessionId);
    if (!session) return;
    const updated: ChatSession = {
      ...session,
      messages: state.messages,
      updatedAt: Date.now(),
    };
    await chatDB.saveSession(updated);
    // Update sessions list in memory too
    set((s) => ({
      sessions: s.sessions.map((ses) => (ses.id === state.activeSessionId ? updated : ses)),
    }));
  },
}));
