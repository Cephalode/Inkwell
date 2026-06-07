import { create } from 'zustand';
import { StudySession, ProgressStats, StreakInfo } from '../types/progress';

interface ProgressState {
  sessions: StudySession[];
  addSession: (session: StudySession) => void;
  getStats: () => ProgressStats;
  getStreak: () => StreakInfo;
  getRecentSessions: (limit: number) => StudySession[];
}

export const useProgressStore = create<ProgressState>()((set, get) => ({
  sessions: [],
  addSession: (session) => set((s) => ({ sessions: [session, ...s.sessions] })),
  getStats: () => {
    const sessions = get().sessions;
    const daySet = new Set(sessions.map((s) => new Date(s.date).toDateString()));
    const dates = Array.from(daySet).sort();
    const currentStreak = calculateStreak(dates);
    return {
      totalStudyTime: sessions.reduce((a, s) => a + s.duration, 0),
      totalDocuments: new Set(sessions.filter((s) => s.documentId).map((s) => s.documentId)).size,
      flashcardsReviewed: sessions
        .filter((s) => s.type === 'flashcard')
        .reduce((a, s) => a + ((s.metadata?.cardsReviewed as number) || 1), 0),
      quizzesTaken: sessions.filter((s) => s.type === 'quiz' || s.type === 'exam').length,
      currentStreak,
      longestStreak: currentStreak,
    };
  },
  getStreak: () => {
    const sessions = get().sessions;
    const daySet = new Set(sessions.map((s) => new Date(s.date).toDateString()));
    const dates = Array.from(daySet).sort();
    const current = calculateStreak(dates);
    return { current, longest: current, lastStudyDate: dates[dates.length - 1] || null };
  },
  getRecentSessions: (limit) => get().sessions.slice(0, limit),
}));

function calculateStreak(dates: string[]): number {
  if (dates.length === 0) return 0;
  let streak = 0;
  const today = new Date();
  for (let i = dates.length - 1; i >= 0; i--) {
    const diff = Math.floor((today.getTime() - new Date(dates[i]).getTime()) / 86400000);
    if (diff === streak || diff === streak + 1) {
      streak = diff === 0 ? streak + 1 : diff;
    } else break;
  }
  return streak;
}
