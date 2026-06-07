import { useCallback } from 'react';
import { useCourseStore } from '../store/courseStore';
import { saveCourse, getAllCourses, deleteCourse, addDocumentToCourse, removeDocumentFromCourse } from '../services/storage/courseStore';
import { Course } from '../types/course';

export function useCourses() {
  const { courses, setCourses, addCourse, updateCourse, removeCourse, setLoading, isLoading } = useCourseStore();

  const loadCourses = useCallback(async () => {
    setLoading(true);
    try {
      const all = await getAllCourses();
      setCourses(all);
    } finally {
      setLoading(false);
    }
  }, [setCourses, setLoading]);

  const createCourse = useCallback(async (name: string, description?: string, color?: string) => {
    const now = Date.now();
    const course: Course = {
      id: `course_${now}`,
      name,
      description,
      color,
      documentIds: [],
      createdAt: now,
      updatedAt: now,
    };
    await saveCourse(course);
    addCourse(course);
  }, [addCourse]);

  const deleteCourseById = useCallback(async (id: string) => {
    await deleteCourse(id);
    removeCourse(id);
  }, [removeCourse]);

  const addDocToCourse = useCallback(async (courseId: string, documentId: string) => {
    await addDocumentToCourse(courseId, documentId);
    const db = await import('../services/storage/courseStore').then(m => m.getCourse(courseId));
    if (db) updateCourse(courseId, db);
  }, [updateCourse]);

  const removeDocFromCourse = useCallback(async (courseId: string, documentId: string) => {
    await removeDocumentFromCourse(courseId, documentId);
    const db = await import('../services/storage/courseStore').then(m => m.getCourse(courseId));
    if (db) updateCourse(courseId, db);
  }, [updateCourse]);

  return { courses, isLoading, loadCourses, createCourse, deleteCourse: deleteCourseById, addDocumentToCourse: addDocToCourse, removeDocumentFromCourse: removeDocFromCourse };
}
