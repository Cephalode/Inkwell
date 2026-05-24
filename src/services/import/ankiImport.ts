import { Flashcard } from '../../types/flashcard';

export function importAnkiDeck(text: string, documentId: string, deckName: string): Flashcard[] {
  const lines = text.split('\n').filter((l) => l.trim());
  return lines.map((line) => {
    const parts = line.split('\t');
    const front = parts[0] || '';
    const back = parts[1] || '';
    return {
      id: crypto.randomUUID(),
      documentId,
      deck: deckName,
      front: front.replace(/<br>/g, '\n'),
      back: back.replace(/<br>/g, '\n'),
      difficulty: 'medium' as const,
      nextReview: Date.now(),
      interval: 1,
      easeFactor: 2.5,
      reviewCount: 0,
      createdAt: Date.now(),
    };
  });
}

export function importCSVFlashcards(text: string, documentId: string, deckName: string): Flashcard[] {
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];
  
  // Skip header
  return lines.slice(1).map((line) => {
    const parts = parseCSVLine(line);
    return {
      id: crypto.randomUUID(),
      documentId,
      deck: deckName,
      front: parts[0] || '',
      back: parts[1] || '',
      difficulty: (parts[2] as any) || 'medium',
      nextReview: Date.now(),
      interval: 1,
      easeFactor: 2.5,
      reviewCount: 0,
      createdAt: Date.now(),
    };
  });
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') { inQuotes = !inQuotes; }
    else if (char === ',' && !inQuotes) { result.push(current); current = ''; }
    else { current += char; }
  }
  result.push(current);
  return result;
}
