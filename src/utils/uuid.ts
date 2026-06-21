/**
 * Generate a UUID v4 — works in both secure (HTTPS/localhost) and
 * insecure contexts (e.g., HTTP via Tailscale IP).
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: crypto.getRandomValues IS available in insecure contexts;
  // only crypto.randomUUID requires a secure context.
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
    (
      Number(c) ^
      (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))
    ).toString(16)
  );
}
