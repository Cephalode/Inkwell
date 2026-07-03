import { useCallback } from 'react';
import { useStudyGuideStore } from '../store/studyGuideStore';
import {
  listStudyGuides,
  getStudyGuide,
  createStudyGuide,
  deleteStudyGuide,
} from '../services/api/client';

export function useStudyGuides() {
  const guides = useStudyGuideStore((s) => s.guides);
  const currentGuide = useStudyGuideStore((s) => s.currentGuide);
  const isLoading = useStudyGuideStore((s) => s.isLoading);
  const error = useStudyGuideStore((s) => s.error);
  const setGuides = useStudyGuideStore((s) => s.setGuides);
  const setCurrentGuide = useStudyGuideStore((s) => s.setCurrentGuide);
  const addGuide = useStudyGuideStore((s) => s.addGuide);
  const removeGuide = useStudyGuideStore((s) => s.removeGuide);
  const setLoading = useStudyGuideStore((s) => s.setLoading);
  const setError = useStudyGuideStore((s) => s.setError);

  const loadGuides = useCallback(
    async (courseId?: string) => {
      setLoading(true);
      setError(null);
      try {
        const data = await listStudyGuides(courseId);
        setGuides(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load study guides');
      } finally {
        setLoading(false);
      }
    },
    [setGuides, setLoading, setError],
  );

  const loadGuide = useCallback(
    async (id: string) => {
      setLoading(true);
      setError(null);
      try {
        const guide = await getStudyGuide(id);
        setCurrentGuide(guide);
        return guide;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load study guide');
        return null;
      } finally {
        setLoading(false);
      }
    },
    [setCurrentGuide, setLoading, setError],
  );

  const createGuide = useCallback(
    async (params: { title?: string; courseId?: string; documentId?: string }) => {
      const guide = await createStudyGuide(params);
      addGuide(guide);
      return guide;
    },
    [addGuide],
  );

  const deleteGuide = useCallback(
    async (id: string) => {
      await deleteStudyGuide(id);
      removeGuide(id);
    },
    [removeGuide],
  );

  return {
    guides,
    currentGuide,
    isLoading,
    error,
    loadGuides,
    loadGuide,
    createGuide,
    deleteGuide,
  };
}
