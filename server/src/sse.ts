import type { Response } from 'express';

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Set standard Server-Sent Events headers on an Express Response.
 * Also flushes headers immediately so the client begins receiving.
 *
 * Extracted from chapterAnalysis.ts / videoDocuments.ts.
 */
export function setSSEHeaders(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
}

/**
 * Write an SSE event to the response stream.
 *
 * The payload (which should include a `type` field for client-side dispatch)
 * is JSON-serialized into a `data:` line terminated by `\n\n`.
 *
 * Wire format: `data: <json>\n\n`
 * This matches the existing frontend consumer (fetch + ReadableStream reader
 * that splits on `\n\n` and looks for `data:` lines).
 */
export function send(res: Response, payload: unknown): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}
