import { useState } from 'react';
import Button from '../shared/Button';
import ProgressBar from '../shared/ProgressBar';
import { QuizQuestion } from '../../types/quiz';
import { HiCheck, HiX } from 'react-icons/hi';

interface QuizPlayerProps {
  questions: QuizQuestion[];
  onAnswer: (questionId: string, answer: string) => void;
  onComplete: () => void;
  answers: Record<string, string>;
  showResults: boolean;
}

export default function QuizPlayer({ questions, onAnswer, onComplete, answers, showResults }: QuizPlayerProps) {
  const [currentIdx, setCurrentIdx] = useState(0);

  if (questions.length === 0) {
    return <div className="text-center text-slate-500 py-16">No quiz generated yet.</div>;
  }

  const q = questions[currentIdx];
  const isCorrect = showResults && answers[q.id]?.toLowerCase() === q.correctAnswer.toLowerCase();

  return (
    <div className="max-w-2xl mx-auto">
      <ProgressBar value={currentIdx + 1} max={questions.length} className="mb-6" />
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-slate-400">Question {currentIdx + 1} of {questions.length}</span>
          {showResults && (isCorrect ? <HiCheck className="text-green-400" /> : <HiX className="text-red-400" />)}
        </div>
        <h3 className="text-lg font-semibold text-slate-200 mb-4">{q.question}</h3>
        {q.type === 'multiple_choice' && q.options && (
          <div className="space-y-2">
            {q.options.map((opt) => (
              <button
                key={opt}
                onClick={() => onAnswer(q.id, opt)}
                className={`w-full text-left px-4 py-3 rounded-lg text-sm transition-all ${
                  answers[q.id] === opt
                    ? 'bg-cyan-600/30 border-cyan-500 text-cyan-200'
                    : 'bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-slate-700'
                } border`}
              >
                {opt}
              </button>
            ))}
          </div>
        )}
        {q.type === 'true_false' && (
          <div className="flex gap-3">
            {['True', 'False'].map((opt) => (
              <button
                key={opt}
                onClick={() => onAnswer(q.id, opt)}
                className={`flex-1 px-4 py-3 rounded-lg text-sm border transition-all ${
                  answers[q.id] === opt
                    ? 'bg-cyan-600/30 border-cyan-500 text-cyan-200'
                    : 'bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        )}
        {q.type === 'fill_blank' && (
          <input
            value={answers[q.id] || ''}
            onChange={(e) => onAnswer(q.id, e.target.value)}
            placeholder="Your answer..."
            className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200"
          />
        )}
        {q.type === 'short_answer' && (
          <textarea
            value={answers[q.id] || ''}
            onChange={(e) => onAnswer(q.id, e.target.value)}
            placeholder="Your answer..."
            rows={3}
            className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 resize-none"
          />
        )}
        {showResults && q.explanation && (
          <div className="mt-4 p-3 rounded-lg bg-slate-700/50 text-sm text-slate-300">
            <strong>Explanation:</strong> {q.explanation}
          </div>
        )}
        <div className="flex justify-between mt-6">
          <Button variant="ghost" onClick={() => setCurrentIdx(Math.max(0, currentIdx - 1))} disabled={currentIdx === 0}>
            Previous
          </Button>
          {currentIdx < questions.length - 1 ? (
            <Button onClick={() => setCurrentIdx(currentIdx + 1)}>Next</Button>
          ) : (
            <Button onClick={onComplete}>Finish Quiz</Button>
          )}
        </div>
      </div>
    </div>
  );
}
