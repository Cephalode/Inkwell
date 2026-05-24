import { getDB } from './db';
import { StudySession } from '../../types/progress';

export async function saveStudySession(session: StudySession): Promise<void> {
  const db = await getDB();
  await db.put('studySessions', session);
}

export async function getAllStudySessions(): Promise<StudySession[]> {
  const db = await getDB();
  return db.getAll('studySessions');
}

export async function getRecentSessions(limit: number): Promise<StudySession[]> {
  const db = await getDB();
  const sessions = await db.getAllFromIndex('studySessions', 'by-date');
  return sessions.reverse().slice(0, limit);
}
