export type QuestionType = 'multiple_choice' | 'true_false' | 'fill_blank' | 'short_answer';

export interface QuizQuestion {
  id: string;
  type: QuestionType;
  question: string;
  options?: string[];
  correctAnswer: string;
  userAnswer?: string;
  explanation?: string;
}

export interface Quiz {
  id: string;
  documentId: string;
  title: string;
  questions: QuizQuestion[];
  score?: number;
  completedAt?: number;
  createdAt: number;
}
