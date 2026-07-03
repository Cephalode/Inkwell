import { useCallback, useEffect, useRef, useState } from 'react';
import { usePracticeTestStore } from '../store/practiceTestStore';

export function usePracticeTests() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tests = usePracticeTestStore((state) => state.tests);
  const fetchTests = usePracticeTestStore((state) => state.fetchTests);
  const loadRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        await fetchTests();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load practice tests');
      } finally {
        setLoading(false);
      }
    };
    loadRef.current = load;
    load();
  }, [fetchTests]);

  const refetch = useCallback(() => loadRef.current(), []);

  return { tests, loading, error, refetch };
}

export function usePracticeTest(testId: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const testDetailsById = usePracticeTestStore((state) => state.testDetailsById);
  const fetchTest = usePracticeTestStore((state) => state.fetchTest);
  const test = testDetailsById[testId];

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        await fetchTest(testId);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load test');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [testId, fetchTest]);

  return { test, loading, error };
}

export function usePracticeTestGeneration() {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generationProgress = usePracticeTestStore((state) => state.generationProgress);
  const generateTest = usePracticeTestStore((state) => state.generateTest);
  const setGenerationProgress = usePracticeTestStore((state) => state.setGenerationProgress);

  const generate = async (testId: string) => {
    setGenerating(true);
    setError(null);

    try {
      await generateTest(testId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Generation failed';
      setError(message);
      setGenerationProgress(testId, {
        stage: 'error',
        itemsGenerated: 0,
        error: message,
      });
    } finally {
      setGenerating(false);
    }
  };

  return { generating, error, generationProgress, generate };
}

export function useTestAttempt() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitAttempt = usePracticeTestStore((state) => state.submitAttempt);

  const submit = async (testId: string, answers: Record<string, string | number | boolean>) => {
    setSubmitting(true);
    setError(null);

    try {
      const result = await submitAttempt(testId, answers);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit';
      setError(message);
      throw err;
    } finally {
      setSubmitting(false);
    }
  };

  return { submitting, error, submit };
}
