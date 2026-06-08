import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCourses } from '../hooks/useCourses';
import { useDocumentStore } from '../store/documentStore';
import CourseDetail from '../components/course/CourseDetail';
import Spinner from '../components/shared/Spinner';

export default function CourseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { courses, isLoading, loadCourses, addDocumentToCourse, removeDocumentFromCourse } =
    useCourses();
  const documents = useDocumentStore((s) => s.documents);

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  const course = courses.find((c) => c.id === id);

  if (isLoading && !course) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner />
      </div>
    );
  }

  if (!course) {
    return <p className="text-slate-400">Course not found</p>;
  }

  return (
    <CourseDetail
      course={course}
      allDocuments={documents}
      onBack={() => navigate('/')}
      onRemoveDoc={removeDocumentFromCourse}
      onAddDoc={addDocumentToCourse}
    />
  );
}
