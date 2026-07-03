/**
 * Consume a fetch() Response carrying a Server-Sent Events stream.
 *
 * Buffers across network chunks and splits on the SSE record delimiter
 * (`\n\n`), so events that straddle chunk boundaries are not dropped.
 * Each `data:` payload is JSON-parsed and passed to `onEvent`; malformed
 * payloads are skipped.
 *
 * If `signal` is provided and becomes aborted, the underlying reader is
 * cancelled and the function returns silently without throwing. This mirrors
 * the abort semantics of useStudyGuideGeneration / useChapterAnalysis, which
 * cancel an in-flight stream on unmount or re-run.
 */
export async function consumeSSE<T = Record<string, unknown>>(
  response: Response,
  onEvent: (event: T) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (!response.body) throw new Error('Response has no body');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel().catch(() => {});
        return;
      }
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
  } catch (err) {
    // If the stream was aborted mid-read, cancel cleanly and stop.
    if (signal?.aborted) {
      await reader.cancel().catch(() => {});
      return;
    }
    throw err;
  }
}
