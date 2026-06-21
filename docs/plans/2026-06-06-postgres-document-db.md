# PostgreSQL + pgvector Document Storage — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Move document/chapter persistence from browser IndexedDB to a PostgreSQL database with pgvector, serving all CRUD through the Express backend API.

**Architecture:** The Express backend (port 3002) gains a Postgres connection pool, document/chapter tables, and file storage on disk under `server/data/files/`. The frontend replaces IndexedDB calls with HTTP requests to the backend. The pgvector extension is enabled and an `embeddings` table is created for future mindmap use.

**Tech Stack:** PostgreSQL 16 (already on system via Nix), `pg` npm package, `multer` for file uploads, `uuid` for ID generation, `pgvector` extension.

---

## Shared Interface Contracts

All subagents must use these exact types and API shapes:

```
### Database Types (Postgres)

documents table:
  id (TEXT PK), name (TEXT), type (TEXT), mime_type (TEXT),
  size (BIGINT), parsed_text (TEXT), thumbnail (TEXT),
  tags (JSONB[]), created_at (TIMESTAMP), updated_at (TIMESTAMP)
  file_path (TEXT) — path on disk relative to server/data/files/

chapters table:
  id (TEXT PK), parent_id (TEXT FK→documents),
  chapter_title (TEXT), chapter_index (INT),
  start_page (INT), end_page (INT), parsed_text (TEXT),
  tags (JSONB[]), file_path (TEXT),
  created_at (TIMESTAMP), updated_at (TIMESTAMP)

embeddings table (for future mindmap):
  id (UUID PK DEFAULT gen_random_uuid()),
  document_id (TEXT FK→documents),
  content (TEXT), chunk_index (INT),
  embedding (vector(1536)),
  created_at (TIMESTAMP)

### REST API (Backend → Frontend)

POST   /api/documents          — upload (multipart/form-data: file field)
GET    /api/documents          — list all documents
GET    /api/documents/:id      — get single document
PATCH  /api/documents/:id      — update tags
DELETE /api/documents/:id      — delete document + file

POST   /api/documents/:id/chapters  — upload chapters (multipart/form-data, expects chapters as separate files)
GET    /api/documents/:id/chapters  — list chapters for document
DELETE /api/documents/:parentId/chapters  — delete all chapters for document
GET    /api/chapters/:id              — get single chapter + download blob

### Frontend API Client

src/services/api/client.ts:
  const API_BASE = '/api';  // proxied by Vite
  Functions: uploadDocument(file), listDocuments(), getDocument(id), updateDocument(id, updates), deleteDocument(id)
  Functions: listChapters(parentId), uploadChapters(parentId, files, metadata[]), deleteChapters(parentId), getChapter(id)

### Vite Proxy

vite.config.ts already proxies /api to localhost:3002 — verify this.
```

---

### Task 1: Backend — Postgres connection pool + schema + pgvector setup

**Objective:** Create the database connection module, run schema migrations, enable pgvector, install npm deps.

**Files:**
- Create: `server/db.ts` — connection pool
- Create: `server/schema.sql` — DDL for documents, chapters, embeddings tables
- Modify: `server/package.json` — add `pg`, `multer`, `uuid` deps

**Step 1: Install npm dependencies**

```bash
cd ~/devel/inkwell/server && npm install pg multer uuid && npm install -D @types/multer @types/uuid
```

**Step 2: Create `server/db.ts`**

```typescript
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432', 10),
  database: process.env.PGDATABASE || 'inkwell',
  user: process.env.PGUSER || 'inkwell',
  password: process.env.PGPASSWORD || '',
  max: 10,
});

export default pool;
```

**Step 3: Create `server/schema.sql`**

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size BIGINT NOT NULL DEFAULT 0,
  parsed_text TEXT DEFAULT '',
  thumbnail TEXT DEFAULT '',
  tags JSONB DEFAULT '[]'::jsonb,
  file_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY,
  parent_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chapter_title TEXT NOT NULL,
  chapter_index INT NOT NULL DEFAULT 0,
  start_page INT NOT NULL DEFAULT 0,
  end_page INT NOT NULL DEFAULT 0,
  parsed_text TEXT DEFAULT '',
  tags JSONB DEFAULT '[]'::jsonb,
  file_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chapters_parent ON chapters(parent_id);

CREATE TABLE IF NOT EXISTS embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  chunk_index INT NOT NULL DEFAULT 0,
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_embeddings_document ON embeddings(document_id);
```

**Step 4: Create the database and user**

```bash
sudo -u postgres psql -c "CREATE USER inkwell WITH PASSWORD 'inkwell';"
sudo -u postgres psql -c "CREATE DATABASE inkwell OWNER inkwell;"
sudo -u postgres psql -d inkwell -c "GRANT ALL ON SCHEMA public TO inkwell;"
```

**Step 5: Enable pgvector extension**

pgvector needs to be installed as a Postgres extension. Check if it's available:
```bash
# If pgvector is installed system-wide:
sudo -u postgres psql -d inkwell -c "CREATE EXTENSION IF NOT EXISTS vector;"
# If not available, we may need to install it or skip for now and add it later
```

**Step 6: Run the schema**

```bash
sudo -u postgres psql -d inkwell -f ~/devel/inkwell/server/schema.sql
```

**Step 7: Verify**

```bash
sudo -u postgres psql -d inkwell -c "\dt"
```
Expected: tables `documents`, `chapters`, `embeddings` listed.

**Step 8: Create data directory for file storage**

```bash
mkdir -p ~/devel/inkwell/server/data/files
```

**Commit:**
```bash
cd ~/devel/inkwell && git add server/db.ts server/schema.sql server/package.json server/package-lock.json
git commit -m "feat: add Postgres connection pool, schema, and pgvector setup"
```

---

### Task 2: Backend — Document CRUD API endpoints

**Objective:** Add REST endpoints for document upload, list, get, update, delete. Files stored on disk under `server/data/files/`.

**Files:**
- Create: `server/routes/documents.ts`
- Modify: `server/index.ts` — mount routes, increase body limit for file uploads, serve static files

**INTERFACE CONTRACT — shared with Task 3:**

```
server/db.ts exports: default pool (pg.Pool)

server/routes/documents.ts exports: router (express.Router)

Routes:
  POST   /                          — multer upload, save to disk + DB
  GET    /                          — SELECT all documents, ORDER BY created_at DESC
  GET    /:id                       — SELECT single document
  PATCH  /:id                       — UPDATE tags (JSONB)
  DELETE /:id                       — DELETE from DB + unlink file from disk
```

**Document upload response shape:**
```json
{
  "id": "uuid-string",
  "name": "file.pdf",
  "type": "pdf",
  "mimeType": "application/pdf",
  "size": 12345,
  "parsedText": "",
  "thumbnail": "",
  "tags": [],
  "createdAt": "2026-06-06T18:00:00.000Z",
  "updatedAt": "2026-06-06T18:00:00.000Z"
}
```

Note: `rawBlob` is NOT returned in JSON responses. File download is a separate endpoint if needed.

**Step 1: Create `server/routes/documents.ts`**

Full implementation:
- `POST /` — use multer with `storage: multer.diskStorage({ destination, filename })` storing to `server/data/files/`. Insert row into `documents` table with `file_path` set to the relative path. Return the document JSON.
- `GET /` — `SELECT * FROM documents ORDER BY created_at DESC`. Return array.
- `GET /:id` — `SELECT * FROM documents WHERE id = $1`. Return single doc or 404.
- `PATCH /:id` — `UPDATE documents SET tags = $2, updated_at = now() WHERE id = $1`. Only allow updating `tags`.
- `DELETE /:id` — Delete file from disk, `DELETE FROM documents WHERE id = $1`. Return 204.

**Step 2: Mount routes in `server/index.ts`**

```typescript
import documentsRouter from './routes/documents.js';
// Increase body limit for file uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
// Mount after CORS
app.use('/api/documents', documentsRouter);
```

**Step 3: Test manually**

```bash
# Start server
cd ~/devel/inkwell && npm run dev:backend

# Upload a test file
curl -X POST http://localhost:3002/api/documents \
  -F "file=@test.txt" \
  -H "Content-Type: multipart/form-data"

# List documents
curl http://localhost:3002/api/documents
```

**Commit:**
```bash
git add server/routes/documents.ts server/index.ts
git commit -m "feat: add document CRUD API endpoints"
```

---

### Task 3: Backend — Chapter CRUD API endpoints

**Objective:** Add REST endpoints for chapters (list by parent, upload, delete by parent, get single + download).

**Files:**
- Create: `server/routes/chapters.ts`
- Modify: `server/index.ts` — mount chapter routes

**INTERFACE CONTRACT — shared with Tasks 2 and 4:**

```
server/routes/chapters.ts exports: router (express.Router)

Routes:
  GET    /documents/:parentId/chapters           — SELECT WHERE parent_id = $1
  POST   /documents/:parentId/chapters           — bulk upload chapters (multer array)
  DELETE /documents/:parentId/chapters           — DELETE WHERE parent_id = $1
  GET    /chapters/:id                           — SELECT single chapter + serve file blob
```

**Step 1: Create `server/routes/chapters.ts`**

- `GET /documents/:parentId/chapters` — list chapters ordered by chapter_index
- `POST /documents/:parentId/chapters` — accept multipart with multiple files + JSON metadata. For each file: save to disk, insert row. Metadata shape: `[{ chapterTitle, chapterIndex, startPage, endPage, parsedText, tags }]`
- `DELETE /documents/:parentId/chapters` — delete all chapters for a parent, remove files from disk
- `GET /chapters/:id` — return chapter JSON (with parsedText). Separate endpoint for downloading the actual file blob if needed.

**Step 2: Mount in `server/index.ts`**

```typescript
import chaptersRouter from './routes/chapters.js';
app.use('/api', chaptersRouter);  // routes handle /documents/:parentId/chapters and /chapters/:id
```

**Step 3: Commit**

```bash
git add server/routes/chapters.ts server/index.ts
git commit -m "feat: add chapter CRUD API endpoints"
```

---

### Task 4: Frontend — API client + migrate useDocuments from IndexedDB to backend API

**Objective:** Create an HTTP API client and rewrite `useDocuments` to call the backend instead of IndexedDB.

**Files:**
- Create: `src/services/api/client.ts` — HTTP wrapper for backend API
- Modify: `src/hooks/useDocuments.ts` — replace IndexedDB calls with API calls
- Modify: `src/services/storage/documentStore.ts` — keep as-is for now (fallback/migration), mark deprecated

**INTERFACE CONTRACT — shared with Task 5:**

```
src/services/api/client.ts exports:

async function uploadDocument(file: File): Promise<DocumentFile>
  — POST /api/documents with FormData { file }
  — Returns DocumentFile (parsedText empty initially, client-side parsing still happens)

async function listDocuments(): Promise<DocumentFile[]>
  — GET /api/documents
  — Maps snake_case DB columns to camelCase DocumentFile fields

async function getDocument(id: string): Promise<DocumentFile>
  — GET /api/documents/:id

async function updateDocumentTags(id: string, tags: string[]): Promise<void>
  — PATCH /api/documents/:id with { tags }

async function deleteDocument(id: string): Promise<void>
  — DELETE /api/documents/:id

Date format: Backend sends ISO strings, frontend parses with new Date(iso).getTime()
Snake→camel mapping: created_at → createdAt, updated_at → updatedAt, mime_type → mimeType
```

**Step 1: Create `src/services/api/client.ts`**

Implement all 5 functions. Use `fetch` directly. Handle snake_case→camelCase mapping with a helper.

**Step 2: Rewrite `src/hooks/useDocuments.ts`**

- `loadDocuments()` — call `listDocuments()` instead of `getAllDocuments()`
- `uploadFile(file)` — call `uploadDocument(file)` then parse client-side (keep `parseFile`), then call `updateDocumentTags()` with classification results
- `deleteDocumentById(id)` — call `deleteDocument(id)`
- Remove all IndexedDB imports

**Step 3: Verify Vite proxy**

Check `vite.config.ts` has proxy for `/api` → `http://localhost:3002`. If not, add it.

**Commit:**
```bash
git add src/services/api/client.ts src/hooks/useDocuments.ts vite.config.ts
git commit -m "feat: migrate document storage from IndexedDB to backend API"
```

---

### Task 5: Frontend — Migrate useChapters from IndexedDB to backend API

**Objective:** Rewrite `useChapters` to call the backend API instead of IndexedDB.

**Files:**
- Modify: `src/services/api/client.ts` — add chapter API functions
- Modify: `src/hooks/useChapters.ts` — replace IndexedDB calls with API calls

**INTERFACE CONTRACT:**

```
src/services/api/client.ts additionally exports:

async function listChapters(parentId: string): Promise<ChapterDocument[]>
  — GET /api/documents/:parentId/chapters

async function uploadChapters(parentId: string, files: { blob: Blob; metadata: ChapterUploadMeta }[]): Promise<ChapterDocument[]>
  — POST /api/documents/:parentId/chapters as multipart with files + JSON metadata
  — ChapterUploadMeta: { chapterTitle, chapterIndex, startPage, endPage, parsedText, tags }

async function deleteChapters(parentId: string): Promise<void>
  — DELETE /api/documents/:parentId/chapters

async function getChapter(id: string): Promise<ChapterDocument>
  — GET /api/chapters/:id
```

**Step 1: Add chapter functions to `src/services/api/client.ts`**

**Step 2: Rewrite `src/hooks/useChapters.ts`**

- `loadChapters()` — call `listChapters(parentDoc.id)`
- `extractChapters()` — still use `splitPDFIntoChapters` for the actual splitting (client-side PDF manipulation), then call `uploadChapters()` with the resulting blobs + metadata, then `deleteChapters()` to clear old ones first
- Remove all IndexedDB imports

**Commit:**
```bash
git add src/services/api/client.ts src/hooks/useChapters.ts
git commit -m "feat: migrate chapter storage from IndexedDB to backend API"
```

---

### Task 6: Integration review and final verification

**Objective:** Verify everything works end-to-end, review all changed files for consistency.

**Files:** All files from Tasks 1–5.

**Step 1: Start both servers**

```bash
cd ~/devel/inkwell && npm run dev
```

**Step 2: Test in browser**

- Open http://localhost:3001
- Upload a PDF document
- Verify it appears in the list
- Verify tags/classification still works
- Verify deletion works
- If chapter extraction exists, test it

**Step 3: Verify Postgres**

```bash
sudo -u postgres psql -d inkwell -c "SELECT id, name, type FROM documents;"
```

**Step 4: Final commit if needed**

```bash
git add -A && git commit -m "feat: complete Postgres document storage migration"
```
