import { getDB } from './db';
import { Course } from '../../types/course';

export async function saveCourse(course: Course): Promise<void> {
  const db = await getDB();
  await db.put('courses', course);
}

export async function getCourse(id: string): Promise<Course | undefined> {
  const db = await getDB();
  return db.get('courses', id);
}

export async function getAllCourses(): Promise<Course[]> {
  const db = await getDB();
  const all = await db.getAll('courses');
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteCourse(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('courses', id);
}

export async function addDocumentToCourse(courseId: string, documentId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('courses', 'readwrite');
  const store = tx.store;
  const course = await store.get(courseId);
  if (course && !course.documentIds.includes(documentId)) {
    course.documentIds.push(documentId);
    course.updatedAt = Date.now();
    await store.put(course);
  }
  await tx.done;
}

export async function removeDocumentFromCourse(courseId: string, documentId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('courses', 'readwrite');
  const store = tx.store;
  const course = await store.get(courseId);
  if (course) {
    course.documentIds = course.documentIds.filter((id: string) => id !== documentId);
    course.updatedAt = Date.now();
    await store.put(course);
  }
  await tx.done;
}
