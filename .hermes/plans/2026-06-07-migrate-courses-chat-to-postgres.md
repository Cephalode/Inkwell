# Migrate Courses & Chat Sessions to Postgres

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Move courses and chat sessions from IndexedDB (or in-memory for chat) to PostgreSQL, so that only app settings remain local. Follow existing patterns from documents/chapters.

**Architecture:** Two new Postgres tables (`courses`, `chat_sessions` + `chat_messages` normalized) with Express CRUD routes mirroring the documents/chapters pattern. Frontend hooks switch from IndexedDB calls to REST API calls. Chat gains actual persistence (currently in-memory only — messages lost on refresh).

**Tech Stack:** PostgreSQL, Express, TypeScript, Zustand

**Design decisions:**
- Chat messages are normalized into `chat_messages` table (listing sessions without loading all messages)
- Course `document_ids` stored as JSONB (matches existing `tags` pattern)
- IDs remain TEXT (matching existing `documents` pattern, not UUID)

---

## Task 1: Add Postgres tables to schema.sql

**Objective:** Define `courses`, `chat_sessions`, and `chat_messages` tables in the database schema.

**Files:**
- Modify: `server/schema.sql`

**Step 1: Append new tables to schema.sql**

Add after the existing `chapters` table block:

```sql
-- Courses
CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '',
  document_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_courses_updated ON courses(updated_at DESC);

-- Chat sessions
CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_document ON chat_sessions(document_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated ON chat_sessions(updated_at DESC);

-- Chat messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  citations JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
```

**Step 2: Apply schema to database**

Run: `psql -d inkwell -f server/schema.sql`
Expected: no errors, tables created.

**Step 3: Commit**

```bash
git add server/schema.sql
git commit -m "schema: add courses, chat_sessions, chat_messages tables"
```

---

## Task 2: Create courses backend route

**Objective:** Full CRUD API for courses at `/api/courses`.

**Files:**
- Create: `server/routes/courses.ts`
- Modify: `server/index.ts`

**Step 1: Create `server/routes/courses.ts`**

Follow the exact pattern from `server/routes/documents.ts` and `server/routes/chapters.ts`:
- Use `import { Router } from 'express'` and `import pool from '../db.js'`
- Define `interface CourseRow` with snake_case columns matching the schema
- Define `rowToCourse(row)` mapper converting snake_case → camelCase, using `toEpoch()` for date fields (same pattern as `toEpoch` in the existing routes — check how they import or inline it)
- Routes:
  - `GET /` — `SELECT * FROM courses ORDER BY updated_at DESC`
  - `GET /:id` — `SELECT * FROM courses WHERE id = $1`
  - `POST /` — `INSERT INTO courses (id, name, description, color, document_ids) VALUES ($1,$2,$3,$4,$5) RETURNING *`
  - `PATCH /:id` — dynamic SET clause for `name`, `description`, `color`, `document_ids`, `updated_at = now()` WHERE `id = $N`
  - `DELETE /:id` — `DELETE FROM courses WHERE id = $1` return 204
- Error handling: try/catch with `res.status(500).json({ error: String(err) })`
- Export default router

**Important:** Read `server/routes/documents.ts` and `server/routes/chapters.ts` first to match the exact coding style (imports, error handling, response format).

**Step 2: Register route in `server/index.ts`**

Add import and `app.use('/api/courses', coursesRouter)` alongside the existing route registrations.

**Step 3: Test with curl**

```bash
# Start server if not running
npx tsx server/index.ts &

# Create
curl -X POST http://localhost:3002/api/courses \
  -H 'Content-Type: application/json' \
  -d '{"id":"course_test","name":"Test Course","description":"test","color":"#ff0000","document_ids":[]}'

# List
curl http://localhost:3002/api/courses

# Get
curl http://localhost:3002/api/courses/course_test

# Update
curl -X PATCH http://localhost:3002/api/courses/course_test \
  -H 'Content-Type: application/json' \
  -d '{"name":"Updated Course"}'

# Delete
curl -X DELETE http://localhost:3002/api/courses/course_test -w '%{http_code}'
# Expected: 204

# Cleanup test row if delete failed
curl -X DELETE http://localhost:3002/api/courses/course_test
```

**Step 4: Commit**

```bash
git add server/routes/courses.ts server/index.ts
git commit -m "feat: add courses CRUD API"
```

---

## Task 3: Create chat sessions backend route

**Objective:** CRUD API for chat sessions and messages at `/api/chat-sessions`.

**Files:**
- Create: `server/routes/chatSessions.ts`
- Modify: `server/index.ts`

**Step 1: Create `server/routes/chatSessions.ts`**

Same pattern as courses/documents. Routes:

- `GET /` — `SELECT id, document_id, title, created_at, updated_at FROM chat_sessions ORDER BY updated_at DESC` (list without messages — lightweight)
- `GET /:id` — fetch session row + `SELECT * FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC`, assemble into `{ id, documentId, title, messages: [...], createdAt, updatedAt }`
- `POST /` — create session (id, title optional, document_id optional), return session
- `PATCH /:id` — update title, document_id, updated_at
- `DELETE /:id` — delete session (ON DELETE CASCADE handles messages), return 204
- `POST /:id/messages` — insert a message: `(id, session_id, role, content, citations)`, also `UPDATE chat_sessions SET updated_at = now() WHERE id = $1`, return the message

Mappers:
- `rowToSession(row)` — snake_case → camelCase, `toEpoch` dates
- `rowToMessage(row)` — snake_case → camelCase, `toEpoch` created_at → `timestamp`

**Step 2: Register route in `server/index.ts`**

```ts
import chatSessionsRouter from './routes/chatSessions.js';
app.use('/api/chat-sessions', chatSessionsRouter);
```

**Step 3: Test with curl**

```bash
# Create session
curl -X POST http://localhost:3002/api/chat-sessions \
  -H 'Content-Type: application/json' \
  -d '{"id":"sess_test","title":"Test Session"}'

# Add message
curl -X POST http://localhost:3002/api/chat-sessions/sess_test/messages \
  -H 'Content-Type: application/json' \
  -d '{"id":"msg_1","role":"user","content":"Hello"}'

# Add assistant message
curl -X POST http://localhost:3002/api/chat-sessions/sess_test/messages \
  -H 'Content-Type: application/json' \
  -d '{"id":"msg_2","role":"assistant","content":"Hi there!"}'

# Get session with messages
curl http://localhost:3002/api/chat-sessions/sess_test
# Expected: session object with messages array in chronological order

# List sessions (no messages)
curl http://localhost:3002/api/chat-sessions

# Delete
curl -X DELETE http://localhost:3002/api/chat-sessions/sess_test -w '%{http_code}'
# Expected: 204
```

**Step 4: Commit**

```bash
git add server/routes/chatSessions.ts server/index.ts
git commit -m "feat: add chat sessions and messages CRUD API"
```

---

## Task 4: Add course API functions to frontend client

**Objective:** Add REST API client functions for courses in `src/services/api/client.ts`.

**Files:**
- Modify: `src/services/api/client.ts`

**Step 1: Add mapper and CRUD functions**

Add after the existing document/chapter API functions. Follow the exact same pattern (fetch, check res.ok, parse, map):

```ts
// --- Courses API ---

function mapCourse(r: any): Course {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? '',
    color: r.color ?? '',
    documentIds: r.document_ids ?? [],
    createdAt: toEpoch(r.created_at),
    updatedAt: toEpoch(r.updated_at),
  };
}

export async function listCourses(): Promise<Course[]> {
  const res = await fetch(`${API_BASE}/courses`);
  if (!res.ok) throw new Error('Failed to list courses');
  const data = await res.json();
  return data.map(mapCourse);
}

export async function getCourse(id: string): Promise<Course> {
  const res = await fetch(`${API_BASE}/courses/${id}`);
  if (!res.ok) throw new Error('Failed to get course');
  const data = await res.json();
  return mapCourse(data);
}

export async function createCourse(course: { name: string; description?: string; color?: string }): Promise<Course> {
  const res = await fetch(`${API_BASE}/courses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: `course_${Date.now()}`,
      name: course.name,
      description: course.description ?? '',
      color: course.color ?? '',
      document_ids: [],
    }),
  });
  if (!res.ok) throw new Error('Failed to create course');
  const data = await res.json();
  return mapCourse(data);
}

export async function updateCourse(id: string, updates: Partial<Pick<Course, 'name' | 'description' | 'color' | 'documentIds'>>): Promise<Course> {
  const body: Record<string, unknown> = {};
  if (updates.name !== undefined) body.name = updates.name;
  if (updates.description !== undefined) body.description = updates.description;
  if (updates.color !== undefined) body.color = updates.color;
  if (updates.documentIds !== undefined) body.document_ids = updates.documentIds;
  const res = await fetch(`${API_BASE}/courses/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Failed to update course');
  const data = await res.json();
  return mapCourse(data);
}

export async function deleteCourse(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/courses/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete course');
}
```

Ensure `Course` type is imported (check existing imports — it may need adding).

**Step 2: Verify build**

Run: `npx tsc --noEmit` (or check Vite dev server for errors)
Expected: no type errors.

**Step 3: Commit**

```bash
git add src/services/api/client.ts
git commit -m "feat: add course REST API client functions"
```

---

## Task 5: Add chat session API functions to frontend client

**Objective:** Add REST API client functions for chat sessions in `src/services/api/client.ts`.

**Files:**
- Modify: `src/services/api/client.ts`

**Step 1: Add mappers and CRUD functions**

```ts
// --- Chat Sessions API ---

function mapChatSession(r: any): ChatSession {
  return {
    id: r.id,
    documentId: r.document_id ?? undefined,
    title: r.title ?? '',
    messages: (r.messages ?? []).map(mapChatMessage),
    createdAt: toEpoch(r.created_at),
    updatedAt: toEpoch(r.updated_at),
  };
}

function mapChatMessage(r: any): ChatMessage {
  return {
    id: r.id,
    role: r.role,
    content: r.content,
    citations: r.citations ?? undefined,
    timestamp: toEpoch(r.created_at),
  };
}

export async function listChatSessions(): Promise<ChatSession[]> {
  const res = await fetch(`${API_BASE}/chat-sessions`);
  if (!res.ok) throw new Error('Failed to list chat sessions');
  const data = await res.json();
  return data.map((r: any) => mapChatSession({ ...r, messages: [] }));
}

export async function getChatSession(id: string): Promise<ChatSession> {
  const res = await fetch(`${API_BASE}/chat-sessions/${id}`);
  if (!res.ok) throw new Error('Failed to get chat session');
  const data = await res.json();
  return mapChatSession(data);
}

export async function createChatSession(title?: string, documentId?: string): Promise<ChatSession> {
  const res = await fetch(`${API_BASE}/chat-sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: `session_${Date.now()}`,
      title: title ?? '',
      document_id: documentId ?? null,
    }),
  });
  if (!res.ok) throw new Error('Failed to create chat session');
  const data = await res.json();
  return mapChatSession({ ...data, messages: [] });
}

export async function updateChatSession(id: string, updates: Partial<Pick<ChatSession, 'title' | 'documentId'>>): Promise<void> {
  const body: Record<string, unknown> = {};
  if (updates.title !== undefined) body.title = updates.title;
  if (updates.documentId !== undefined) body.document_id = updates.documentId;
  const res = await fetch(`${API_BASE}/chat-sessions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Failed to update chat session');
}

export async function addChatMessage(sessionId: string, message: { id: string; role: string; content: string; citations?: any[] }): Promise<void> {
  const res = await fetch(`${API_BASE}/chat-sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: message.id,
      role: message.role,
      content: message.content,
      citations: message.citations ?? null,
    }),
  });
  if (!res.ok) throw new Error('Failed to add chat message');
}

export async function deleteChatSession(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/chat-sessions/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete chat session');
}
```

Ensure `ChatSession` and `ChatMessage` types are imported.

**Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: no type errors.

**Step 3: Commit**

```bash
git add src/services/api/client.ts
git commit -m "feat: add chat session REST API client functions"
```

---

## Task 6: Migrate useCourses hook from IndexedDB to REST API

**Objective:** Switch `src/hooks/useCourses.ts` to call the REST API instead of IndexedDB storage.

**Files:**
- Modify: `src/hooks/useCourses.ts`

**Step 1: Replace IndexedDB imports with API imports**

Remove: `import { saveCourse, getCourse, getAllCourses, deleteCourse, addDocumentToCourse, removeDocumentFromCourse } from '../services/storage/courseStore'`

Add: `import { listCourses, createCourse, updateCourse, deleteCourse as deleteCourseAPI, getCourse as getCourseAPI } from '../services/api/client'`

Note: The IndexedDB `addDocumentToCourse`/`removeDocumentToCourse` are transactional read-modify-writes. With the REST API, we call `updateCourse(id, { documentIds: [...updated] })` — the backend handles the atomic update.

**Step 2: Rewrite hook functions**

Follow the pattern from `src/hooks/useDocuments.ts`:

- `loadCourses()` → `const data = await listCourses(); setCourses(data);`
- `createCourse(name, description?, color?)` → `const c = await createCourseAPI({ name, description, color }); addCourse(c); return c;`
- `deleteCourseById(id)` → `await deleteCourseAPI(id); removeCourse(id);`
- `addDocToCourse(courseId, docId)` → read current course from store, compute new `documentIds` with docId added, call `updateCourse(courseId, { documentIds })`, then update Zustand
- `removeDocFromCourse(courseId, docId)` → same pattern, filter out docId

**Pitfall:** The existing hook has the `addDocToCourse`/`removeDocFromCourse` functions calling IndexedDB then re-fetching. The new version reads from Zustand (already in memory), computes the new array, calls API, then updates Zustand. No need to re-fetch from API.

**Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: no type errors.

**Step 4: Commit**

```bash
git add src/hooks/useCourses.ts
git commit -m "feat: migrate useCourses hook from IndexedDB to REST API"
```

---

## Task 7: Add chat session persistence to chat store and UI

**Objective:** Chat messages are currently lost on refresh. Add session management — auto-save messages to Postgres, load session history, and provide session switching.

**Files:**
- Modify: `src/store/chatStore.ts`
- Create: `src/hooks/useChatSessions.ts`
- Modify: `src/components/chat/GlobalChat.tsx`

This is the largest task. Break into sub-steps:

**Step 7a: Enhance chat Zustand store**

Add to `src/store/chatStore.ts`:
- State: `sessions: ChatSession[]`, `currentSessionId: string | null`, `isLoadingSessions: boolean`
- Actions: `setSessions`, `addSession`, `updateSessionInList`, `removeSession`, `setCurrentSession`, `setLoadingSessions`

Keep existing `messages`, `isLoading`, etc. for the active session's messages.

**Step 7b: Create `src/hooks/useChatSessions.ts`**

New hook (following `useDocuments` pattern):
- `loadSessions()` → `listChatSessions()` → `setSessions()`
- `createSession(title?, documentId?)` → `createChatSession()` → `addSession()` → `setCurrentSession(id)`
- `switchSession(id)` → `getChatSession(id)` (loads with messages) → populate `messages` in chatStore
- `deleteSession(id)` → `deleteChatSession()` → `removeSession()`, clear if it was current
- `saveMessage(message)` → `addChatMessage(currentSessionId, message)` (fire-and-forget with console.error catch)

**Step 7c: Integrate into GlobalChat.tsx**

- Call `loadSessions()` on mount
- When user sends a message, create session if none active, then `saveMessage()` after the LLM responds
- Auto-generate session title from first user message (or use first N chars)
- Add a session list sidebar or dropdown (minimal — can be refined later)
- "New session" button creates a new empty session
- Session switching loads messages from API into the store

**Step 7d: Verify manually**

- Open app, send a message, refresh page → messages should persist
- Create multiple sessions, switch between them, messages should be correct per session
- Delete a session, verify it's gone

**Step 5: Commit**

```bash
git add src/store/chatStore.ts src/hooks/useChatSessions.ts src/components/chat/GlobalChat.tsx
git commit -m "feat: add chat session persistence with Postgres backend"
```

---

## Task 8: Clean up IndexedDB — remove courses and chatSessions stores

**Objective:** Remove the now-unused IndexedDB stores and dead code.

**Files:**
- Modify: `src/services/storage/db.ts`
- Delete: `src/services/storage/courseStore.ts`
- Delete: `src/services/storage/chatSessionStore.ts` (if it exists — exploration found it doesn't)

**Step 1: Update `src/services/storage/db.ts`**

- Remove `chatSessions` and `courses` from the `InkwellDB` interface
- Remove the `courses` object store creation in the upgrade function
- Remove `chapters` from the interface too (already dead — superseded by Postgres)
- Remove the `chapters` store creation in the upgrade function (v3 block)
- Bump DB version to 7, add a downgrade cleanup:
  ```ts
  if (oldVersion < 7) {
    if (db.objectStoreNames.contains('chatSessions')) db.deleteObjectStore('chatSessions');
    if (db.objectStoreNames.contains('courses')) db.deleteObjectStore('courses');
    if (db.objectStoreNames.contains('chapters')) db.deleteObjectStore('chapters');
  }
  ```
- Remove `chatSessions` from `storeNames` array in `migrateFromStudyForge()`
- Remove the `chapters` store from the migration upgrade function too

**Step 2: Delete dead storage files**

```bash
rm src/services/storage/courseStore.ts
# chatSessionStore.ts likely doesn't exist, check first
ls src/services/storage/chatSessionStore.ts && rm src/services/storage/chatSessionStore.ts
```

**Step 3: Verify no remaining imports**

Run: `grep -r "courseStore\|chatSessionStore" src/`
Expected: no matches (if there are, update those imports).

**Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: no type errors.

**Step 5: Commit**

```bash
git add src/services/storage/db.ts
git rm src/services/storage/courseStore.ts 2>/dev/null; true
git commit -m "chore: remove courses and chatSessions from IndexedDB schema"
```

---

## Task 9: Update inkwell skill documentation

**Objective:** Update the Hermes skill to reflect the new architecture — courses and chat sessions are now Postgres-backed.

**Files:**
- Modify: `~/.hermes/profiles/ocythoe/skills/projects/inkwell/SKILL.md`

**Step 1: Update relevant sections**

- In "Course Type" section: change "Stored in IndexedDB `courses` store" → "Stored in PostgreSQL `courses` table"
- Update Storage/Zustand/Hook descriptions to reflect REST API instead of IndexedDB
- In "Chat" related sections: add note about session persistence in Postgres
- Update the Backend Details routes list to include `/api/courses` and `/api/chat-sessions`
- Update "Key Directories" table to include `server/routes/courses.ts` and `server/routes/chatSessions.ts`
- Update "Architecture" to mention chat sessions are Postgres-backed
- Add `src/hooks/useChatSessions.ts` to Key Directories

**Step 2: Commit**

```bash
git add ~/.hermes/profiles/ocythoe/skills/projects/inkwell/SKILL.md
git commit -m "docs: update inkwell skill for courses/chat Postgres migration"
```

---

## Verification Checklist

After all tasks:

- [ ] `psql -d inkwell -c '\dt'` shows `courses`, `chat_sessions`, `chat_messages` tables
- [ ] `curl http://localhost:3002/api/courses` returns `[]`
- [ ] `curl http://localhost:3002/api/chat-sessions` returns `[]`
- [ ] Frontend loads without console errors
- [ ] Create a course in UI → verify it appears in `curl` output
- [ ] Add a document to a course in UI → verify `document_ids` updated via API
- [ ] Open chat, send a message, refresh page → message persists
- [ ] Create multiple chat sessions → switch between them → messages correct
- [ ] Delete a course → verify it's gone from API and UI
- [ ] IndexedDB in browser DevTools shows no `courses` or `chatSessions` stores
- [ ] `npx tsc --noEmit` passes with no errors
