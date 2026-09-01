import { useEffect, useState } from 'react';
import CourseCard from '../components/course/CourseCard';
import CourseDetail from '../components/course/CourseDetail';
import EmptyState from '../components/shared/EmptyState';
import Spinner from '../components/shared/Spinner';
import { useCourses } from '../hooks/useCourses';
import { useDocumentStore } from '../store/documentStore';
import { Course } from '../types/course';
import { Link } from 'react-router-dom';
import { HiPlus, HiX, HiDownload } from 'react-icons/hi';

export default function CoursesPage() {
  const { courses, isLoading, loadCourses, createCourse, deleteCourse: deleteCourseById, addDocumentToCourse, removeDocumentFromCourse } = useCourses();
  const documents = useDocumentStore((s) => s.documents);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCourseName, setNewCourseName] = useState('');
  const [newCourseSubject, setNewCourseSubject] = useState('');
  const [newCourseDescription, setNewCourseDescription] = useState('');

  useEffect(() => { loadCourses(); }, [loadCourses]);

  const handleCreate = async () => {
    if (!newCourseName.trim()) return;
    const description = newCourseDescription.trim() || newCourseSubject.trim() || undefined;
    await createCourse(newCourseName.trim(), description);
    setNewCourseName('');
    setNewCourseSubject('');
    setNewCourseDescription('');
    setShowCreateForm(false);
  };

  // If a course is selected, show detail view
  if (selectedCourse) {
    const updatedCourse = courses.find(c => c.id === selectedCourse.id) || selectedCourse;
    return (
      <CourseDetail
        course={updatedCourse}
        allDocuments={documents}
        onBack={() => setSelectedCourse(null)}
        onRemoveDoc={removeDocumentFromCourse}
        onAddDoc={addDocumentToCourse}
      />
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white mb-1">📚 Courses</h1>
          <p className="text-slate-400">Organize your study materials into courses</p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
        >
          {showCreateForm ? <HiX className="w-4 h-4" /> : <HiPlus className="w-4 h-4" />}
          {showCreateForm ? 'Cancel' : 'New Course'}
        </button>
      </div>

      {showCreateForm && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 space-y-4">
          <input
            type="text"
            value={newCourseName}
            onChange={(e) => setNewCourseName(e.target.value)}
            placeholder="Course name"
            className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-sm"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <input
            type="text"
            value={newCourseSubject}
            onChange={(e) => setNewCourseSubject(e.target.value)}
            placeholder="Subject (optional) — e.g. Biology, Calculus"
            className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-sm"
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <textarea
            value={newCourseDescription}
            onChange={(e) => setNewCourseDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-sm resize-none"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleCreate}
              disabled={!newCourseName.trim()}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Create Course
            </button>
            <Link
              to="/coursera"
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-sm font-medium transition-colors border border-slate-600"
            >
              <HiDownload className="w-4 h-4" />
              Import from connections
            </Link>
          </div>
        </div>
      )}

      {isLoading && courses.length === 0 ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : courses.length === 0 ? (
        <EmptyState
          icon="📚"
          title="No courses yet"
          description="Create your first course to organize your study materials"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {courses.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              documentCount={course.documentIds.length}
              onClick={setSelectedCourse}
              onDelete={deleteCourseById}
            />
          ))}
        </div>
      )}
    </div>
  );
}
