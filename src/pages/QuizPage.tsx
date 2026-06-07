import { useState, useRef } from 'react';
import QuizPlayer from '../components/quiz/QuizPlayer';
import Card from '../components/shared/Card';
import Button from '../components/shared/Button';
import EmptyState from '../components/shared/EmptyState';
import Spinner from '../components/shared/Spinner';
import Badge from '../components/shared/Badge';
import { useQuizStore } from '../store/quizStore';
import { useDocumentStore } from '../store/documentStore';
import { useProgress } from '../hooks/useProgress';
import { chatCompletion } from '../services/ai/client';
import { QUIZ_PROMPT } from '../services/ai/prompts';
import { generateUUID } from '../utils/uuid';

export default function QuizPage() {
  const { currentQuiz, setQuiz, answers, showResults, completeQuiz, answerQuestion } = useQuizStore();
  const documents = useDocumentStore((s) => s.documents);
  const { trackSession } = useProgress();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState('');
  const [questionCount, setQuestionCount] = useState(5);
  const startTimeRef = useRef<number>(Date.now());

  const handleGenerate = async () => {
    const doc = documents.find((d) => d.id === selectedDoc);
    if (!doc?.parsedText) return;
    setIsLoading(true);
    startTimeRef.current = Date.now();
    try {
      const result = await chatCompletion([{ role: 'user', content: QUIZ_PROMPT(doc.parsedText, questionCount, ['multiple_choice', 'true_false', 'fill_blank']) }]);
      const parsed = JSON.parse(result.match(/\[.*\]/s)?.[0] || '[]');
      setQuiz({
        id: generateUUID(), documentId: doc.id, title: `Quiz: ${doc.name}`,
        questions: parsed.map((q: any) => ({ ...q, id: generateUUID() })),
        createdAt: Date.now(),
      });
    } catch { /* handle error */ }
    setIsLoading(false);
  };

  const handleComplete = () => {
    completeQuiz();
    const quiz = useQuizStore.getState().currentQuiz;
    if (!quiz) return;
    const correctCount = quiz.questions.filter(
      (q) => answers[q.id]?.toLowerCase() === q.correctAnswer.toLowerCase(),
    ).length;
    const totalQuestions = quiz.questions.length;
    const scorePercent = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
    const durationSec = Math.round((Date.now() - startTimeRef.current) / 1000);
    trackSession({
      id: generateUUID(),
      type: 'quiz',
      documentId: quiz.documentId,
      duration: durationSec,
      date: Date.now(),
      score: scorePercent,
      metadata: { questionCount: totalQuestions, correctCount },
    });
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">❓ Quiz</h1>
        <p className="text-slate-400">Test your knowledge with AI-generated quizzes</p>
      </div>

      {!currentQuiz ? (
        <Card>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Document</label>
              <select value={selectedDoc} onChange={(e) => setSelectedDoc(e.target.value)} className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-200">
                <option value="">Select document...</option>
                {documents.map((doc) => <option key={doc.id} value={doc.id}>{doc.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Number of questions</label>
              <input type="number" min={1} max={20} value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value))} className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-200" />
            </div>
            <Button onClick={handleGenerate} isLoading={isLoading} disabled={!selectedDoc}>
              Generate Quiz
            </Button>
          </div>
        </Card>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-4 gap-2">
            <h3 className="text-base sm:text-lg font-semibold text-slate-200 truncate">{currentQuiz.title}</h3>
            <Button variant="ghost" size="sm" onClick={() => setQuiz(null as any)}>New Quiz</Button>
          </div>
          <QuizPlayer
            questions={currentQuiz.questions}
            onAnswer={answerQuestion}
            onComplete={handleComplete}
            answers={answers}
            showResults={showResults}
          />
        </div>
      )}
    </div>
  );
}
