export interface CourseraCourse { id: string; slug: string; name: string; status: 'completed' | 'enrolled' | 'unenrolled' }
export interface CourseraItem { id: string; name: string; slug: string; type: string; locked: boolean; url: string }
export interface CourseraLesson { id: string; name: string; slug: string; items: CourseraItem[] }
export interface CourseraModule { id: string; name: string; slug: string; lessons: CourseraLesson[] }

const API = (typeof window !== 'undefined' ? window.location.origin : '') + '/api/coursera';

async function json<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Request failed (${r.status})`);
  return r.json();
}

export const getCourseraStatus = () => fetch(`${API}/status`).then((r) => json<{ linked: boolean }>(r));
export const linkCoursera = (cauth: string) =>
  fetch(`${API}/link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cauth }) })
    .then((r) => json<{ linked: boolean; courseCount: number }>(r));
export const unlinkCoursera = () => fetch(`${API}/link`, { method: 'DELETE' }).then((r) => json<{ linked: boolean }>(r));
export const listCourseraCourses = () => fetch(`${API}/courses`).then((r) => json<CourseraCourse[]>(r));
export const getCourseOutline = (slug: string) => fetch(`${API}/courses/${slug}/outline`).then((r) => json<CourseraModule[]>(r));
