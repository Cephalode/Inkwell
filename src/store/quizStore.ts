import { create } from 'zustand';
import { Quiz, QuizQuestion } from '../types/quiz';

interface QuizState {
  currentQuiz: Quiz | null;
  currentQuestionIndex: number;
  answers: Record<string, string>;
  showResults: boolean;
  setQuiz: (quiz: Quiz) => void;
  answerQuestion: (questionId: string, answer: string) => void;
  nextQuestion: () => void;
  prevQuestion: () => void;
  completeQuiz: () => void;
  resetQuiz: () => void;
}

export const useQuizStore = create<QuizState>()((set, get) => ({
  currentQuiz: null,
  currentQuestionIndex: 0,
  answers: {},
  showResults: false,
  setQuiz: (quiz) => set({ currentQuiz: quiz, currentQuestionIndex: 0, answers: {}, showResults: false }),
  answerQuestion: (id, answer) => set((s) => ({ answers: { ...s.answers, [id]: answer } })),
  nextQuestion: () => set((s) => {
    const max = (s.currentQuiz?.questions.length ?? 1) - 1;
    return { currentQuestionIndex: Math.min(s.currentQuestionIndex + 1, max) };
  }),
  prevQuestion: () => set((s) => ({ currentQuestionIndex: Math.max(0, s.currentQuestionIndex - 1) })),
  completeQuiz: () => {
    const { currentQuiz, answers } = get();
    if (!currentQuiz) return;
    const questions = currentQuiz.questions.map((q) => ({ ...q, userAnswer: answers[q.id] }));
    const score = questions.filter((q) => q.userAnswer?.toLowerCase() === q.correctAnswer.toLowerCase()).length;
    set({
      currentQuiz: { ...currentQuiz, questions, score, completedAt: Date.now() },
      showResults: true,
    });
  },
  resetQuiz: () => set({ currentQuiz: null, currentQuestionIndex: 0, answers: {}, showResults: false }),
}));
