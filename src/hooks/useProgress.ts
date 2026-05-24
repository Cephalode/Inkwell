import { useCallback, useEffect } from 'react';
import { useProgressStore } from '../store/progressStore';
import { getAllStudySessions, saveStudySession } from '../services/storage/progressStore';
import { StudySession } from '../types/progress';

export function useProgress() {
  const { sessions, addSession, getStats, getStreak } = useProgressStore();

  const loadSessions = useCallback(async () => {
    const stored = await getAllStudySessions();
    for (const s of stored) addSession(s);
  }, [addSession]);

  const trackSession = useCallback(async (session: StudySession) => {
    addSession(session);
    await saveStudySession(session);
  }, [addSession]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  return { sessions, stats: getStats(), streak: getStreak(), trackSession };
}
