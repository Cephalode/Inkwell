import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCourses } from '../hooks/useCourses';
import { useDocumentStore } from '../store/documentStore';
import { getCourse } from '../services/api/client';
import CourseDetail from '../components/course/CourseDetail';
import Spinner from '../components/shared/Spinner';
import { HOME } from '../config/home';
import type { Course } from '../types/course';

export default function CourseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { courses, isLoading, loadCourses, addDocumentToCourse, removeDocumentFromCourse } =
    useCourses();
  const documents = useDocumentStore((s) => s.documents);
  const [fetchedCourse, setFetchedCourse] = useState<Course | null>(null);

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  // On a hard refresh the courses list isn't hydrated yet, so fetch this
  // specific course directly when it's missing from the store.
  useEffect(() => {
    if (!id) return;
    if (courses.some((c) => c.id === id)) return;
    let cancelled = false;
    getCourse(id)
      .then((c) => { if (!cancelled) setFetchedCourse(c); })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [id, courses]);

  const course = courses.find((c) => c.id === id) ?? fetchedCourse;

  if (isLoading && !course) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner />
      </div>
    );
  }

  if (!course) {
    return <p style={{ opacity: 0.6 }}>Course not found</p>;
  }

  return (
    <CourseDetail
      course={course}
      allDocuments={documents}
      onBack={() => navigate(HOME)}
      onRemoveDoc={removeDocumentFromCourse}
      onAddDoc={addDocumentToCourse}
    />
  );
}
