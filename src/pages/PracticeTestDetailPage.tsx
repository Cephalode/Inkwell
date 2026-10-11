import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { HiArrowLeft, HiLightBulb } from 'react-icons/hi';
import Spinner from '../components/shared/Spinner';
import { usePracticeTest, usePracticeTestGeneration, useTestAttempt } from '../hooks/usePracticeTests';
import { usePracticeTestStore } from '../store/practiceTestStore';
import type { TestAttemptResult } from '../types/practiceTest';

export default function PracticeTestDetailPage() {
  const { testId } = useParams<{ testId: string }>();
  const navigate = useNavigate();

  const { test, loading, error } = usePracticeTest(testId || '');
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
  const [hintShownFor, setHintShownFor] = useState<Record<string, boolean>>({});

  // Early return if no testId
  if (!testId) {
    return <div>Test not found</div>;
  }

  // Spinner while the test is loading or about to load. Only fall back to
  // "not found" once a fetch has completed with an error and still no test,
  // so a hard refresh doesn't spin forever on a failed request.
  if (!test) {
    if (loading || !error) {
      return (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="mb-4" style={{ opacity: 0.6 }}>Test not found</p>
        <button onClick={() => navigate('/tests')} className="btn btn-secondary">
          <HiArrowLeft className="w-4 h-4" />
          Back to Tests
        </button>
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
      <div className="space-y-6" style={{ maxWidth: 860 }}>
        <button onClick={() => navigate('/tests')} className="btn btn-ghost">
          <HiArrowLeft className="w-4 h-4" />
          Back to Tests
        </button>

        <div className="card space-y-4" style={{ padding: 'var(--space-6)' }}>
          <div className="card-kicker">Results</div>
          <h1 style={{ fontSize: 28, margin: 0 }}>Test Results</h1>
          <div style={{ fontSize: 48, fontWeight: 600, color: 'var(--color-accent)' }}>
            {Math.round(results.score)}%
          </div>
          <p style={{ opacity: 0.6, margin: 0 }}>
            {results.totalQuestions} questions · {Math.round((results.score / 100) * results.totalQuestions)} correct
          </p>
        </div>

        {/* Results by question */}
        <div className="space-y-4">
          {questions.map((q) => {
            const graded = results.gradedAnswers[q.id];
            return (
              <div key={q.id} className="card p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="text-sm font-semibold mb-1">{q.prompt}</p>
                    {q.qtype === 'mcq' || q.qtype === 'true_false' ? (
                      <p className="text-xs" style={{ opacity: 0.7 }}>
                        {graded?.isCorrect ? (
                          <span style={{ color: 'var(--color-success)' }}>✓ Correct</span>
                        ) : (
                          <>
                            <span style={{ color: 'var(--color-danger)' }}>✗ Incorrect</span>
                            <br />
                            Correct: {String(q.correct_answer ?? '')}
                          </>
                        )}
                      </p>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-xs" style={{ opacity: 0.6 }}>
                          Your answer: <span style={{ opacity: 0.9 }}>{graded?.studentAnswer}</span>
                        </p>
                        <p className="text-xs">
                          {graded?.isCorrect ? (
                            <span style={{ color: 'var(--color-success)' }}>✓ Correct</span>
                          ) : (
                            <span style={{ color: 'var(--color-danger)' }}>✗ {graded?.feedback}</span>
                          )}
                        </p>
                      </div>
                    )}
                  </div>
                  <div
                    className="text-2xl font-semibold"
                    style={{
                      color: graded?.isCorrect ? 'var(--color-success)' : 'var(--color-danger)',
                    }}
                  >
                    {graded?.pointsAwarded}/{1}
                  </div>
                </div>
                {q.explanation && (
                  <p
                    className="text-xs pt-3"
                    style={{ opacity: 0.6, borderTop: '1px solid var(--color-divider)' }}
                  >
                    {q.explanation}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <button onClick={() => navigate('/tests')} className="btn btn-primary w-full">
          All Tests
        </button>
      </div>
    );
  }

  if (totalQuestions === 0) {
    const isGenerating = generating || !!generationProgress[testId] || test.status === 'generating';
    return (
      <div className="space-y-6 text-center py-20">
        <p style={{ opacity: 0.6 }}>
          {isGenerating ? 'Generating questions…' : 'No questions in this test yet'}
        </p>
        {test.status === 'error' && (
          <p className="text-sm" style={{ color: 'var(--color-danger)' }}>
            {test.error || 'Generation failed'}
          </p>
        )}
        <div className="flex justify-center gap-3">
          <button onClick={() => navigate('/tests')} className="btn btn-secondary">
            <HiArrowLeft className="w-4 h-4" />
            Back to Tests
          </button>
          <button
            onClick={() => generate(testId)}
            disabled={isGenerating}
            className="btn btn-primary"
          >
            {isGenerating ? 'Generating…' : 'Generate Questions'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" style={{ maxWidth: 860 }}>
      <button onClick={() => navigate('/tests')} className="btn btn-ghost">
        <HiArrowLeft className="w-4 h-4" />
        Back to Tests
      </button>

      <div>
        <h1 style={{ fontSize: 28, margin: '0 0 var(--space-1)' }}>{test.title}</h1>
        <p style={{ opacity: 0.6, margin: 0 }}>{totalQuestions} questions</p>
      </div>

      {/* Progress bar */}
      <div
        className="w-full h-2 overflow-hidden"
        style={{ background: 'var(--color-neutral-300)', borderRadius: 'var(--radius-sm)' }}
      >
        <div
          className="h-full transition-all duration-300"
          style={{ background: 'var(--color-accent)', width: `${progress_pct}%` }}
        />
      </div>

      {/* Question */}
      <div className="card space-y-4" style={{ padding: 'var(--space-6)' }}>
        <div className="flex justify-between items-start">
          <div>
            <p className="text-xs uppercase tracking-wide mb-2" style={{ opacity: 0.5 }}>
              Question {currentQuestionIndex + 1} of {totalQuestions}
            </p>
            <h2 className="text-xl">{currentQuestion.prompt}</h2>
          </div>
          {currentQuestion.qtype === 'true_false' && (
            <span
              className="text-xs px-2 py-1 whitespace-nowrap"
              style={{
                background: 'var(--color-neutral-200)',
                borderRadius: 'var(--radius-sm)',
                opacity: 0.75,
              }}
            >
              True/False
            </span>
          )}
          {currentQuestion.qtype === 'mcq' && (
            <span
              className="text-xs px-2 py-1 whitespace-nowrap"
              style={{
                background: 'var(--color-neutral-200)',
                borderRadius: 'var(--radius-sm)',
                opacity: 0.75,
              }}
            >
              Multiple Choice
            </span>
          )}
          {currentQuestion.qtype === 'short_answer' && (
            <span
              className="text-xs px-2 py-1 whitespace-nowrap"
              style={{
                background: 'var(--color-neutral-200)',
                borderRadius: 'var(--radius-sm)',
                opacity: 0.75,
              }}
            >
              Short Answer
            </span>
          )}
          {currentQuestion.topic && (
            <span
              className="text-xs px-2 py-1 whitespace-nowrap"
              style={{
                background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
                color: 'var(--color-accent)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              {currentQuestion.topic}
            </span>
          )}
          {'hint' in currentQuestion && currentQuestion.hint && (
            <button
              onClick={() => setHintShownFor((s) => ({ ...s, [currentQuestion.id]: true }))}
              className="btn btn-ghost whitespace-nowrap"
              style={{ padding: '2px 8px', fontSize: 12 }}
              title="Show hint"
            >
              <HiLightBulb className="w-4 h-4" />
              Hint
            </button>
          )}
        </div>
        {'hint' in currentQuestion && currentQuestion.hint && hintShownFor[currentQuestion.id] && (
          <p className="text-sm" style={{ opacity: 0.7, margin: 0 }}>
            💡 {currentQuestion.hint}
          </p>
        )}

        {/* Answer input */}
        <div className="space-y-3">
          {currentQuestion.qtype === 'mcq' && (
            <div className="space-y-2">
              {(currentQuestion.options || []).map((option: string, idx: number) => (
                <label
                  key={idx}
                  className="flex items-center gap-3 p-3 cursor-pointer transition-colors hover:border-[var(--color-accent)]"
                  style={{
                    background: 'var(--color-neutral-100)',
                    border: '1px solid var(--color-neutral-300)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <input
                    type="radio"
                    name={`question-${currentQuestion.id}`}
                    value={option}
                    checked={answers[currentQuestion.id] === option}
                    onChange={(e) => handleAnswer(e.target.value)}
                    className="w-4 h-4"
                    style={{ accentColor: 'var(--color-accent)' }}
                  />
                  <span>{option}</span>
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
                  className="flex items-center gap-3 p-3 cursor-pointer transition-colors hover:border-[var(--color-accent)]"
                  style={{
                    background: 'var(--color-neutral-100)',
                    border: '1px solid var(--color-neutral-300)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <input
                    type="radio"
                    name={`question-${currentQuestion.id}`}
                    value={value}
                    checked={answers[currentQuestion.id] === value}
                    onChange={() => handleAnswer(value)}
                    className="w-4 h-4"
                    style={{ accentColor: 'var(--color-accent)' }}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          )}

          {currentQuestion.qtype === 'short_answer' && (
            <textarea
              value={String(answers[currentQuestion.id] || '')}
              onChange={(e) => handleAnswer(e.target.value)}
              placeholder="Type your answer here…"
              className="input resize-none"
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
          className="btn btn-secondary"
        >
          Previous
        </button>

        <div className="flex gap-3">
          {currentQuestionIndex < totalQuestions - 1 && (
            <button onClick={handleNext} className="btn btn-secondary">
              Next
            </button>
          )}

          {currentQuestionIndex === totalQuestions - 1 && (
            <button onClick={handleSubmit} disabled={submittingTest} className="btn btn-primary">
              {submittingTest ? 'Grading…' : 'Submit Test'}
            </button>
          )}
        </div>
      </div>

      {/* Previous attempts */}
      {attempts.length > 0 && (
        <div className="space-y-3">
          <h3 className="section-label" style={{ margin: 0 }}>Previous Attempts</h3>
          <div className="flex flex-col">
            {[...attempts]
              .sort(
                (a, b) =>
                  new Date(b.completed_at ?? b.started_at).getTime() -
                  new Date(a.completed_at ?? a.started_at).getTime(),
              )
              .map((attempt) => (
                <div
                  key={attempt.id}
                  className="flex items-center justify-between"
                  style={{
                    padding: '10px 0',
                    borderTop: '1px solid var(--color-neutral-300)',
                  }}
                >
                  <span className="text-sm" style={{ opacity: 0.6 }}>
                    {new Date(attempt.completed_at ?? attempt.started_at).toLocaleDateString(
                      'en-US',
                      { month: 'short', day: 'numeric', year: 'numeric' },
                    )}
                  </span>
                  <span
                    className="text-sm font-semibold"
                    style={{ color: 'var(--color-accent-700)' }}
                  >
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
