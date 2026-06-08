import { useCallback } from 'react';
import { useCourseStore } from '../store/courseStore';
import { listCourses, createCourse as createCourseAPI, updateCourse, deleteCourse as deleteCourseAPI } from '../services/api/client';

export function useCourses() {
  const { courses, setCourses, addCourse, removeCourse, setLoading, isLoading } = useCourseStore();

  const loadCourses = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listCourses();
      setCourses(data);
    } finally {
      setLoading(false);
    }
  }, [setCourses, setLoading]);

  const createCourse = useCallback(async (name: string, description?: string, color?: string) => {
    const c = await createCourseAPI({ name, description, color });
    addCourse(c);
    return c;
  }, [addCourse]);

  const deleteCourseById = useCallback(async (id: string) => {
    await deleteCourseAPI(id);
    removeCourse(id);
  }, [removeCourse]);

  const addDocToCourse = useCallback(async (courseId: string, documentId: string) => {
    try {
      const current = courses.find((c) => c.id === courseId);
      if (!current) return;
      const updated = [...current.documentIds, documentId];
      const result = await updateCourse(courseId, { documentIds: updated });
      // Update Zustand with the server result
      const state = useCourseStore.getState();
      state.updateCourse(courseId, result);
    } catch (err) {
      console.error('Failed to add document to course:', err);
    }
  }, [courses]);

  const removeDocFromCourse = useCallback(async (courseId: string, documentId: string) => {
    try {
      const current = courses.find((c) => c.id === courseId);
      if (!current) return;
      const updated = current.documentIds.filter((id) => id !== documentId);
      const result = await updateCourse(courseId, { documentIds: updated });
      const state = useCourseStore.getState();
      state.updateCourse(courseId, result);
    } catch (err) {
      console.error('Failed to remove document from course:', err);
    }
  }, [courses]);

  return { courses, isLoading, loadCourses, createCourse, deleteCourse: deleteCourseById, addDocumentToCourse: addDocToCourse, removeDocumentFromCourse: removeDocFromCourse };
}
