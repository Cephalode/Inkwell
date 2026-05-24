export interface TextChunk {
  text: string;
  index: number;
  startChar: number;
  endChar: number;
  metadata?: Record<string, unknown>;
}

export function chunkText(
  text: string,
  chunkSize: number = 1500,
  overlap: number = 200
): TextChunk[] {
  if (!text || text.length <= chunkSize) {
    return [{ text: text || '', index: 0, startChar: 0, endChar: text?.length || 0 }];
  }

  const chunks: TextChunk[] = [];
  let start = 0;
  let index = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    let chunkEnd = end;

    // Try to break at sentence boundary
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf('.', end);
      const lastNewline = text.lastIndexOf('\n', end);
      const breakPoint = Math.max(lastPeriod, lastNewline);
      if (breakPoint > start + chunkSize * 0.5) {
        chunkEnd = breakPoint + 1;
      }
    }

    chunks.push({
      text: text.slice(start, chunkEnd).trim(),
      index,
      startChar: start,
      endChar: chunkEnd,
    });

    start = chunkEnd - overlap;
    if (start >= text.length) break;
    index++;
  }

  return chunks;
}

export function findRelevantChunks(query: string, chunks: TextChunk[], topK: number = 3): TextChunk[] {
  const queryWords = query.toLowerCase().split(/\s+/).filter(Boolean);
  const scored = chunks.map((chunk) => {
    const lower = chunk.text.toLowerCase();
    const score = queryWords.reduce((acc, word) => {
      const matches = lower.split(word).length - 1;
      return acc + matches;
    }, 0);
    return { chunk, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map((s) => s.chunk);
}
