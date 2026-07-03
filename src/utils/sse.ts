/**
 * Consume a fetch() Response carrying a Server-Sent Events stream.
 *
 * Buffers across network chunks and splits on the SSE record delimiter
 * (`\n\n`), so events that straddle chunk boundaries are not dropped —
 * mirrors the parser in useStudyGuideGeneration. Each `data:` payload is
 * JSON-parsed and passed to `onEvent`; malformed payloads are skipped.
 */
export async function consumeSSE<T = Record<string, unknown>>(
  response: Response,
  onEvent: (event: T) => void,
): Promise<void> {
  if (!response.body) throw new Error('Response has no body');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);

      for (const line of rawEvent.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        try {
          onEvent(JSON.parse(trimmed.slice(5).trim()) as T);
        } catch {
          // Skip malformed payloads
        }
      }
    }
  }
}
