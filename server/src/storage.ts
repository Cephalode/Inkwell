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
}

/** Download an object. Returns raw bytes. */
export async function storageDownload(path: string): Promise<Buffer> {
  const res = await fetch(`${base}/object/${BUCKET}/${path}`, { headers: auth() });
  if (!res.ok) throw new Error(`storageDownload(${path}) failed: ${res.status} ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Delete an object (missing objects are a no-op, like unlinkSync). */
export async function storageDelete(path: string): Promise<void> {
  const res = await fetch(`${base}/object/${BUCKET}/${path}`, {
    method: 'DELETE',
    headers: auth(),
  });
  // 404 = already gone; treat as success like the old unlinkSync try/catch
  if (!res.ok && res.status !== 404) throw new Error(`storageDelete(${path}) failed: ${res.status} ${await res.text()}`);
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
