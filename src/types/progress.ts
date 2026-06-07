export interface StudySession {
  id: string;
  type: 'flashcard' | 'quiz' | 'pomodoro' | 'chat' | 'reading' | 'exam' | 'tutor';
  documentId?: string;
  duration: number;
  date: number;
  score?: number;
  metadata?: Record<string, unknown>;
}

export interface DayStudyRecord {
  date: string;
  minutes: number;
  sessions: number;
}

export interface StreakInfo {
  current: number;
  longest: number;
  lastStudyDate: string | null;
}

export interface ProgressStats {
  totalStudyTime: number;
  totalDocuments: number;
  flashcardsReviewed: number;
  quizzesTaken: number;
  currentStreak: number;
  longestStreak: number;
}

export interface TopicMastery {
  topic: string;
  mastery: number;
  lastStudied: number;
}
