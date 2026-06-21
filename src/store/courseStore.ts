import { create } from 'zustand';
import { Course } from '../types/course';

interface CourseState {
  courses: Course[];
  isLoading: boolean;
  setCourses: (courses: Course[]) => void;
  addCourse: (course: Course) => void;
  updateCourse: (id: string, updates: Partial<Course>) => void;
  removeCourse: (id: string) => void;
  setLoading: (loading: boolean) => void;
}

export const useCourseStore = create<CourseState>()((set) => ({
  courses: [],
  isLoading: false,
  setCourses: (courses) => set({ courses }),
  addCourse: (course) => set((s) => ({ courses: [course, ...s.courses] })),
  updateCourse: (id, updates) => set((s) => ({
    courses: s.courses.map((c) => (c.id === id ? { ...c, ...updates } : c)),
  })),
  removeCourse: (id) => set((s) => ({ courses: s.courses.filter((c) => c.id !== id) })),
  setLoading: (loading) => set({ isLoading: loading }),
}));
