import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { HiArrowLeft } from 'react-icons/hi';
import Spinner from '../components/shared/Spinner';
import { usePracticeTest, usePracticeTestGeneration, useTestAttempt } from '../hooks/usePracticeTests';
import { usePracticeTestStore } from '../store/practiceTestStore';
import type { TestAttemptResult } from '../types/practiceTest';

export default function PracticeTestDetailPage() {
  const { testId } = useParams<{ testId: string }>();
  const navigate = useNavigate();

  const { test, loading } = usePracticeTest(testId || '');
  const { generate, generating, generationProgress } = usePracticeTestGeneration();
  const { submit } = useTestAttempt();

  const attempts = usePracticeTestStore((state) =>
    testId ? state.testAttempts[testId] ?? [] : [],
  );
  const fetchAttempts = usePracticeTestStore((state) => state.fetchAttempts);

  useEffect(() => {
    if (testId) {
      fetchAttempts(testId);
    }
  }, [testId, fetchAttempts]);

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | number | boolean>>({});
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState<TestAttemptResult | null>(null);
  const [submittingTest, setSubmittingTest] = useState(false);

  // Early return if no testId
  if (!testId) {
    return <div>Test not found</div>;
  }

  if (loading || !test) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  const questions = test.questions || [];
  const currentQuestion = questions[currentQuestionIndex];
  const totalQuestions = questions.length;
  const progress_pct =
    totalQuestions > 0 ? ((currentQuestionIndex + 1) / totalQuestions) * 100 : 0;

  const handleAnswer = (value: string | number | boolean) => {
    setAnswers({
      ...answers,
      [currentQuestion.id]: value,
    });
  };

  const handleNext = () => {
    if (currentQuestionIndex < totalQuestions - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  const handleSubmit = async () => {
    setSubmittingTest(true);
    try {
      const result = await submit(testId, answers);
      // The take-mode fetch strips correct_answer/explanation; reload with
      // reveal so the results view can show them
      await usePracticeTestStore.getState().fetchTest(testId, true);
      setResults(result);
      setShowResults(true);
    } catch (err) {
      console.error('Failed to submit test:', err);
      setSubmittingTest(false);
    }
  };

  if (showResults && results) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => navigate('/tests')}
          className="flex items-center gap-2 px-3 py-1.5 text-slate-400 hover:text-slate-200 transition-colors"
        >
          <HiArrowLeft className="w-4 h-4" />
          Back to Tests
        </button>

        <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/50 rounded-xl p-6 space-y-4">
          <h1 className="text-3xl font-bold text-white">Test Results</h1>
          <div className="text-5xl font-bold text-teal-400">{Math.round(results.score)}%</div>
          <p className="text-slate-400">
            {results.totalQuestions} questions · {Math.round((results.score / 100) * results.totalQuestions)} correct
          </p>
        </div>

        {/* Results by question */}
        <div className="space-y-4">
          {questions.map((q) => {
            const graded = results.gradedAnswers[q.id];
            return (
              <div
                key={q.id}
                className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-200 mb-1">{q.prompt}</p>
                    {q.qtype === 'mcq' || q.qtype === 'true_false' ? (
                      <p className="text-xs text-slate-500">
                        {graded?.isCorrect ? (
                          <span className="text-green-400">✓ Correct</span>
                        ) : (
                          <>
                            <span className="text-red-400">✗ Incorrect</span>
                            <br />
                            Correct: {String(q.correct_answer ?? '')}
                          </>
                        )}
                      </p>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-xs text-slate-400">
                          Your answer: <span className="text-slate-300">{graded?.studentAnswer}</span>
                        </p>
                        <p className="text-xs text-slate-400">
                          {graded?.isCorrect ? (
                            <span className="text-green-400">✓ Correct</span>
                          ) : (
                            <span className="text-red-400">✗ {graded?.feedback}</span>
                          )}
                        </p>
                      </div>
                    )}
                  </div>
                  <div
                    className={`text-2xl font-bold ${graded?.isCorrect ? 'text-green-400' : 'text-red-400'}`}
                  >
                    {graded?.pointsAwarded}/{1}
                  </div>
                </div>
                {q.explanation && (
                  <p className="text-xs text-slate-400 border-t border-slate-700/50 pt-3">
                    {q.explanation}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <button
          onClick={() => navigate('/tests')}
          className="w-full px-4 py-3 bg-teal-600 hover:bg-teal-500 text-white rounded-lg font-medium transition-colors"
        >
          All Tests
        </button>
      </div>
    );
  }

  if (totalQuestions === 0) {
    const isGenerating = generating || !!generationProgress[testId] || test.status === 'generating';
    return (
      <div className="space-y-6 text-center py-20">
        <p className="text-slate-400">
          {isGenerating ? 'Generating questions…' : 'No questions in this test yet'}
        </p>
        {test.status === 'error' && (
          <p className="text-sm text-red-400">{test.error || 'Generation failed'}</p>
        )}
        <div className="flex justify-center gap-3">
          <button
            onClick={() => navigate('/tests')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-700/50 hover:bg-slate-700 text-slate-300 rounded-lg font-medium transition-colors"
          >
            <HiArrowLeft className="w-4 h-4" />
            Back to Tests
          </button>
          <button
            onClick={() => generate(testId)}
            disabled={isGenerating}
            className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:bg-slate-700 text-white rounded-lg font-medium transition-colors"
          >
            {isGenerating ? 'Generating…' : 'Generate Questions'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate('/tests')}
        className="flex items-center gap-2 px-3 py-1.5 text-slate-400 hover:text-slate-200 transition-colors"
      >
        <HiArrowLeft className="w-4 h-4" />
        Back to Tests
      </button>

      <div>
        <h1 className="text-2xl font-bold text-white mb-2">{test.title}</h1>
        <p className="text-slate-400">{totalQuestions} questions</p>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 bg-slate-700/60 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-teal-500 to-cyan-400 transition-all duration-300"
          style={{ width: `${progress_pct}%` }}
        />
      </div>

      {/* Question */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 space-y-4">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">
              Question {currentQuestionIndex + 1} of {totalQuestions}
            </p>
            <h2 className="text-xl font-semibold text-slate-200">{currentQuestion.prompt}</h2>
          </div>
          {currentQuestion.qtype === 'true_false' && (
            <span className="text-xs bg-slate-700/50 text-slate-400 px-2 py-1 rounded">
              True/False
            </span>
          )}
          {currentQuestion.qtype === 'mcq' && (
            <span className="text-xs bg-slate-700/50 text-slate-400 px-2 py-1 rounded">
              Multiple Choice
            </span>
          )}
          {currentQuestion.qtype === 'short_answer' && (
            <span className="text-xs bg-slate-700/50 text-slate-400 px-2 py-1 rounded">
              Short Answer
            </span>
          )}
        </div>

        {/* Answer input */}
        <div className="space-y-3">
          {currentQuestion.qtype === 'mcq' && (
            <div className="space-y-2">
              {(currentQuestion.options || []).map((option: string, idx: number) => (
                <label
                  key={idx}
                  className="flex items-center gap-3 p-3 bg-slate-900/50 border border-slate-700/50 rounded-lg cursor-pointer hover:border-teal-600/50 transition-colors"
                >
                  <input
                    type="radio"
                    name={`question-${currentQuestion.id}`}
                    value={option}
                    checked={answers[currentQuestion.id] === option}
                    onChange={(e) => handleAnswer(e.target.value)}
                    className="w-4 h-4"
                  />
                  <span className="text-slate-200">{option}</span>
                </label>
              ))}
            </div>
          )}

          {currentQuestion.qtype === 'true_false' && (
            <div className="space-y-2">
              {[
                { label: 'True', value: 'true' },
                { label: 'False', value: 'false' },
              ].map(({ label, value }) => (
                <label
                  key={label}
                  className="flex items-center gap-3 p-3 bg-slate-900/50 border border-slate-700/50 rounded-lg cursor-pointer hover:border-teal-600/50 transition-colors"
                >
                  <input
                    type="radio"
                    name={`question-${currentQuestion.id}`}
                    value={value}
                    checked={answers[currentQuestion.id] === value}
                    onChange={() => handleAnswer(value)}
                    className="w-4 h-4"
                  />
                  <span className="text-slate-200">{label}</span>
                </label>
              ))}
            </div>
          )}

          {currentQuestion.qtype === 'short_answer' && (
            <textarea
              value={String(answers[currentQuestion.id] || '')}
              onChange={(e) => handleAnswer(e.target.value)}
              placeholder="Type your answer here…"
              className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700/50 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500 text-sm resize-none"
              rows={4}
            />
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex gap-3 justify-between">
        <button
          onClick={handlePrevious}
          disabled={currentQuestionIndex === 0}
          className="px-6 py-2 bg-slate-700/50 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded-lg font-medium transition-colors"
        >
          Previous
        </button>

        <div className="flex gap-3">
          {currentQuestionIndex < totalQuestions - 1 && (
            <button
              onClick={handleNext}
              className="px-6 py-2 bg-slate-700/50 hover:bg-slate-700 text-slate-300 rounded-lg font-medium transition-colors"
            >
              Next
            </button>
          )}

          {currentQuestionIndex === totalQuestions - 1 && (
            <button
              onClick={handleSubmit}
              disabled={submittingTest}
              className="px-6 py-2 bg-teal-600 hover:bg-teal-500 disabled:bg-slate-700 text-white rounded-lg font-medium transition-colors"
            >
              {submittingTest ? 'Grading…' : 'Submit Test'}
            </button>
          )}
        </div>
      </div>

      {/* Previous attempts */}
      {attempts.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
            Previous Attempts
          </h3>
          <div className="space-y-2">
            {[...attempts]
              .sort(
                (a, b) =>
                  new Date(b.completed_at ?? b.started_at).getTime() -
                  new Date(a.completed_at ?? a.started_at).getTime(),
              )
              .map((attempt) => (
                <div
                  key={attempt.id}
                  className="flex items-center justify-between bg-slate-800/50 border border-slate-700/50 rounded-lg px-4 py-3"
                >
                  <span className="text-sm text-slate-400">
                    {new Date(attempt.completed_at ?? attempt.started_at).toLocaleDateString(
                      'en-US',
                      { month: 'short', day: 'numeric', year: 'numeric' },
                    )}
                  </span>
                  <span className="text-sm font-semibold text-teal-400">
                    {Math.round(attempt.score)}%
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
