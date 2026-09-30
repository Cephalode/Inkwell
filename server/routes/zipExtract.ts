// Zip extraction — add a .zip to the documents tree, then unzip it into a new
// subfolder. POST /api/folders/:id/unzip accepts the uploaded archive, creates
// `archiveName/` under the target folder, walks the archive entries, and
// recreates the inner tree: subdirectories become folders, files become
// documents (uploaded to Storage, inserted like regular uploads — but skipped
// for classify/summary, which would choke on archives of binary junk).
// Pass `root` as :id to extract into the top level.
//
// Safety: every entry path is sanitized against zip-slip (absolute paths, ..
// traversal, drive letters) and extraction caps exist for entry count, size
// per entry, and total uncompressed bytes (zip bombs).
import { Router, type Request, type Response } from 'express';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import unzipper from 'unzipper';
import pool from '../db.js';
import { uid } from '../src/auth.js';
import { storageUpload } from '../src/storage.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// ── Caps (defense against zip bombs / runaway archives) ──────────────────────
const MAX_ENTRIES = 2000;
const MAX_ENTRY_BYTES = 200 * 1024 * 1024; // 200 MB per file
const MAX_TOTAL_BYTES = 1024 * 1024 * 1024; // 1 GB extracted total

// Media normalization — mirrors server/routes/documents.ts so extracted files
// land with the same canonical types the rest of the app expects.
const AUDIO_EXTS = new Set(['mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'opus', 'flac', 'webm']);
const VIDEO_EXTS = new Set(['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi']);
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'heic']);

function typeForExt(ext: string, mime: string): string {
  return AUDIO_EXTS.has(ext) && (mime.startsWith('audio/') || !VIDEO_EXTS.has(ext))
    ? 'audio'
    : VIDEO_EXTS.has(ext)
      ? 'video'
      : IMAGE_EXTS.has(ext) || mime.startsWith('image/')
        ? 'image'
        : ext;
}

function mimeForExt(ext: string): string {
  const table: Record<string, string> = {
    pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', heic: 'image/heic',
    mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav',
    ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/opus', flac: 'audio/flac',
    mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/x-m4v', webm: 'video/webm',
    mkv: 'video/x-matroska', avi: 'video/x-msvideo',
    txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', html: 'text/html',
    json: 'application/json', xml: 'application/xml', js: 'text/javascript',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    epub: 'application/epub+zip',
  };
  return table[ext] || 'application/octet-stream';
}

/**
 * Sanitize one archive entry path into a safe, relative list of segments.
 * Returns null for entries that are unsafe or degenerate ('.', '..', empty).
 * Strips: leading slashes, drive letters, `..`/`.` segments, double slashes.
 */
function sanitizeEntryPath(rawPath: string): string[] | null {
  const normalized = rawPath.replace(/\\/g, '/');
  // Strip Windows drive prefixes like C:/
  const withoutDrive = normalized.replace(/^[A-Za-z]:/, '');
  const segments = withoutDrive.split('/').filter((s) => s.length > 0 && s !== '.');
  if (segments.length === 0) return null;
  for (const seg of segments) {
    if (seg === '..') return null; // traversal — reject the entry outright
  }
  return segments;
}

interface ExtractedFile {
  segments: string[];
  buffer: Buffer;
}

/** Walk the archive from a buffer. Enforces entry/size caps before returning. */
async function walkArchive(buffer: Buffer): Promise<{ dirs: string[][]; files: ExtractedFile[]; totalBytes: number }> {
  const directory = await unzipper.Open.buffer(buffer);
  const dirs = new Set<string>(); // joined relative dir paths
  const files: ExtractedFile[] = [];
  let totalBytes = 0;

  const addImplicitDirs = (segments: string[]) => {
    for (let i = 1; i < segments.length; i++) {
      dirs.add(segments.slice(0, i).join('/'));
    }
  };

  for (const entry of directory.files) {
    const safe = sanitizeEntryPath(entry.path);
    if (!safe) continue; // unsafe or empty — skip silently

    if (entry.type === 'Directory') {
      dirs.add(safe.join('/'));
      addImplicitDirs(safe);
      continue;
    }

    if (files.length >= MAX_ENTRIES) {
      throw new Error(`Archive has more than ${MAX_ENTRIES} files`);
    }
    // Uncompressed size from the central directory; verify with the real
    // buffered size below so a lying header can't smuggle past the cap.
    const limit = MAX_ENTRY_BYTES;
    if ((entry.uncompressedSize || 0) > limit) {
      throw new Error(`"${safe[safe.length - 1]}" is larger than the 200 MB per-file limit`);
    }
    const content = (await entry.buffer()) as Buffer;
    if (content.length > limit) {
      throw new Error(`"${safe[safe.length - 1]}" is larger than the 200 MB per-file limit`);
    }
    totalBytes += content.length;
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new Error('Archive expands past the 1 GB total size limit');
    }

    files.push({ segments: safe, buffer: content });
    addImplicitDirs(safe);
  }

  return {
    dirs: Array.from(dirs).map((d) => d.split('/')),
    files,
    totalBytes,
  };
}

// ── POST /:id/unzip — upload a .zip and extract into a new subfolder ─────────
// Field name: file. `root` as :id extracts into the top level.
router.post('/:id/unzip', upload.single('file'), async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No file uploaded' });

  const ext = path.extname(file.originalname).slice(1).toLowerCase();
  if (ext !== 'zip') {
    return res.status(400).json({ error: 'Only .zip archives are supported' });
  }

  const parentId = String(req.params.id) === 'root' ? null : String(req.params.id);
  // Folder name = archive name without the extension, sanitized.
  const archiveStem = path.basename(file.originalname, path.extname(file.originalname)).trim() || 'Archive';
  const folderName = archiveStem.replace(/[/\\:*?"<>|]/g, '_').slice(0, 120);

  // Hoisted so the catch block can clean up a partial extraction.
  let rootId: string | null = null;

  try {
    // 1. Validate destination folder ownership (when not root).
    if (parentId) {
      const { rowCount } = await pool.query('SELECT 1 FROM folders WHERE id = $1 AND user_id = $2', [parentId, uid(req)]);
      if (!rowCount) return res.status(400).json({ error: 'Destination folder not found' });
    }

    // 2. Walk the archive (sanitizes entries, enforces caps) BEFORE any writes.
    let walked: Awaited<ReturnType<typeof walkArchive>>;
    try {
      walked = await walkArchive(file.buffer);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to read archive';
      return res.status(400).json({ error: message });
    }
    const { dirs, files, totalBytes } = walked;

    // 3. Create the root folder for the archive.
    rootId = randomUUID();
    await pool.query(
      'INSERT INTO folders (id, user_id, name, parent_id) VALUES ($1, $2, $3, $4)',
      [rootId, uid(req), folderName, parentId],
    );

    // 4. Create subfolders — parents before children (sort by depth, then path).
    const folderIdByPath = new Map<string, string>();
    const sortedDirs = [...dirs].sort((a, b) => a.length - b.length || a.join('/').localeCompare(b.join('/')));
    for (const segments of sortedDirs) {
      const parentKey = segments.slice(0, -1).join('/');
      const parentDbId = parentKey === '' ? rootId : folderIdByPath.get(parentKey);
      if (!parentDbId) continue; // should not happen; defensive
      const id = randomUUID();
      await pool.query(
        'INSERT INTO folders (id, user_id, name, parent_id) VALUES ($1, $2, $3, $4)',
        [id, uid(req), segments[segments.length - 1], parentDbId],
      );
      folderIdByPath.set(segments.join('/'), id);
    }

    // 5. Create documents for the files. classify/summary/podcast are settled
    //    to 'skipped' at insert — extracted archives aren't worth auto-LLM.
    let documentsCreated = 0;
    for (const f of files) {
      const parentKey = f.segments.slice(0, -1).join('/');
      const docFolderId = parentKey === '' ? rootId : folderIdByPath.get(parentKey) ?? rootId;
      const fileName = f.segments[f.segments.length - 1];
      const fileExt = path.extname(fileName).slice(1).toLowerCase();
      const mimeType = mimeForExt(fileExt);
      const docId = randomUUID();
      const storagePath = `${docId}_${fileName}`;
      await storageUpload(storagePath, f.buffer, mimeType);
      await pool.query(
        `INSERT INTO documents (id, name, type, mime_type, size, file_path, user_id, folder_id, classify_status, summary_status, podcast_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'skipped', 'skipped', 'skipped')`,
        [docId, fileName, typeForExt(fileExt, mimeType), mimeType, f.buffer.length, storagePath, uid(req), docFolderId],
      );
      documentsCreated++;
    }

    const { rows } = await pool.query('SELECT id, name, color, parent_id, created_at FROM folders WHERE id = $1', [rootId]);
    res.status(201).json({
      folder: {
        id: rows[0].id,
        name: rows[0].name,
        color: rows[0].color,
        parentId: rows[0].parent_id,
        createdAt: new Date(rows[0].created_at).getTime(),
      },
      foldersCreated: 1 + folderIdByPath.size,
      documentsCreated,
      totalBytes,
    });
  } catch (err: unknown) {
    console.error('Error extracting archive:', err);
    // Best-effort cleanup: if we created the archive folder but then blew up,
    // remove it (folder/document rows cascade via FK; Storage objects are
    // orphan-tolerated like the delete route).
    if (rootId) {
      try {
        await pool.query('DELETE FROM folders WHERE id = $1 AND user_id = $2', [rootId, uid(req)]);
        console.error(`Cleaned up partial extraction folder ${rootId}`);
      } catch { /* cleanup best-effort */ }
    }
    res.status(500).json({ error: 'Failed to extract archive' });
  }
});

export default router;
