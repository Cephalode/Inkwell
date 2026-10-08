// Supabase Storage wrapper — thin fetch client for the Storage REST API.
// Auth: `apikey` header with the secret key (new sb_secret_ keys are NOT
// valid Compact JWSes, so `Authorization: Bearer` is rejected with
// "Invalid Compact JWS" — apikey is the correct form).
import '../env.js';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SECRET = process.env.SUPABASE_SECRET_KEY || '';
const BUCKET = 'documents';

const base = `${SUPABASE_URL}/storage/v1`;

function auth(headers: Record<string, string> = {}): Record<string, string> {
  return { apikey: SECRET, ...headers };
}

/** Upload/overwrite an object. `body` is raw bytes. */
export async function storageUpload(path: string, body: Buffer | Uint8Array, contentType: string): Promise<void> {
  const res = await fetch(`${base}/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: auth({ 'Content-Type': contentType, 'x-upsert': 'true' }),
    body,
  });
  if (!res.ok) throw new Error(`storageUpload(${path}) failed: ${res.status} ${await res.text()}`);
  cacheInvalidate(path);
}

// ponytail: byte cache — podcast replays + repeated PDF text extraction were
// blowing the 5 GB Supabase egress cap. Naive FIFO eviction, no TTL; add LRU
// if the working set ever thrashes. Buffers are shared with callers — safe
// today (res.end / Uint8Array-copy), don't mutate the returned Buffer.
const MAX_CACHE_BYTES = 256 * 1024 * 1024;
const cache = new Map<string, Buffer>();
let cacheBytes = 0;

function cacheEvict(): void {
  while (cacheBytes > MAX_CACHE_BYTES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cacheBytes -= cache.get(oldest)!.length;
    cache.delete(oldest);
  }
}

function cacheInvalidate(path: string): void {
  const buf = cache.get(path);
  if (buf) {
    cacheBytes -= buf.length;
    cache.delete(path);
  }
}

/** Download an object. Returns raw bytes (cached after first fetch). */
export async function storageDownload(path: string): Promise<Buffer> {
  const hit = cache.get(path);
  if (hit) return hit;
  const res = await fetch(`${base}/object/${BUCKET}/${path}`, { headers: auth() });
  if (!res.ok) throw new Error(`storageDownload(${path}) failed: ${res.status} ${await res.text()}`);
  const buf = Buffer.from(await res.arrayBuffer());
  cache.set(path, buf);
  cacheBytes += buf.length;
  cacheEvict();
  return buf;
}

/** Delete an object (missing objects are a no-op, like unlinkSync). */
export async function storageDelete(path: string): Promise<void> {
  const res = await fetch(`${base}/object/${BUCKET}/${path}`, {
    method: 'DELETE',
    headers: auth(),
  });
  // 404 = already gone; treat as success like the old unlinkSync try/catch
  if (!res.ok && res.status !== 404) throw new Error(`storageDelete(${path}) failed: ${res.status} ${await res.text()}`);
  cacheInvalidate(path);
}

/**
 * Storage key for a document/chapter file.
 * Mirrors the old on-disk naming: {id}_{originalName}
 */
export function storageKey(id: string, name: string): string {
  return `${id}_${name}`;
}

/**
 * Is this file_path a Storage key (vs a YouTube URL)?
 * Video documents store their source URL in file_path; everything else
 * used to be an absolute disk path and is now a Storage key.
 */
export function isStorageKey(filePath: string | null | undefined): boolean {
  return !!filePath && !filePath.startsWith('http');
}
