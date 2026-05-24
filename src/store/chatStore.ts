import { create } from 'zustand';
import { ChatMessage, ChatSession } from '../types/chat';

interface ChatState {
  sessions: ChatSession[];
  currentSession: ChatSession | null;
  isLoading: boolean;
  setSessions: (sessions: ChatSession[]) => void;
  addSession: (session: ChatSession) => void;
  setCurrentSession: (session: ChatSession | null) => void;
  addMessage: (sessionId: string, message: ChatMessage) => void;
  setLoading: (loading: boolean) => void;
}

export const useChatStore = create<ChatState>()((set) => ({
  sessions: [],
  currentSession: null,
  isLoading: false,
  setSessions: (sessions) => set({ sessions }),
  addSession: (session) => set((s) => ({ sessions: [session, ...s.sessions] })),
  setCurrentSession: (session) => set({ currentSession: session }),
  addMessage: (sessionId, message) => set((s) => ({
    sessions: s.sessions.map((sess) =>
      sess.id === sessionId
        ? { ...sess, messages: [...sess.messages, message], updatedAt: Date.now() }
        : sess
    ),
    currentSession: s.currentSession?.id === sessionId
      ? { ...s.currentSession, messages: [...s.currentSession.messages, message], updatedAt: Date.now() }
      : s.currentSession,
  })),
  setLoading: (loading) => set({ isLoading: loading }),
}));
