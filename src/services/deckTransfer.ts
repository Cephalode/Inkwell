import { Flashcard } from '../types/flashcard';
import { saveFlashcards, getAllFlashcards } from './storage/flashcardStore';

/** Format version for forward/backward compatibility */
export const DECK_FILE_VERSION = 1;

export interface DeckExportFile {
  version: number;
  app: 'inkwell';
  exportedAt: number;
  /** Total cards in the export */
  cardCount: number;
  cards: Flashcard[];
}

/**
 * Export an array of flashcards to a downloadable JSON file.
 * @param cards  The cards to include in the export
 * @param fileName  Suggested file name (without extension)
 */
export function exportDeckToFile(cards: Flashcard[], fileName?: string): void {
  const payload: DeckExportFile = {
    version: DECK_FILE_VERSION,
    app: 'inkwell',
    exportedAt: Date.now(),
    cardCount: cards.length,
    cards,
  };

  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = fileName
    ? `${fileName.replace(/[^a-zA-Z0-9_-]/g, '_')}.inkwell.json`
    : `inkwell-decks-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export all flashcards from the store.
 */
export async function exportAllDecks(): Promise<void> {
  const cards = await getAllFlashcards();
  if (cards.length === 0) {
    throw new Error('No flashcards to export.');
  }
  exportDeckToFile(cards);
}

/**
 * Validate and parse an imported deck file.
 * Returns parsed cards or throws on validation failure.
 */
export function parseImportFile(jsonString: string): Flashcard[] {
  let data: unknown;
  try {
    data = JSON.parse(jsonString);
  } catch {
    throw new Error('Invalid JSON file. Please select a valid .inkwell.json export.');
  }

  // Basic shape validation
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid file structure.');
  }

  const obj = data as Record<string, unknown>;

  // Check for our app marker or a reasonable cards array
  if (obj.app === 'inkwell' && obj.version === DECK_FILE_VERSION) {
    // Standard export
  } else if (Array.isArray(obj)) {
    // Plain array of flashcards — accept it too
    data = { cards: obj, version: 0 };
  } else if (Array.isArray(obj.cards)) {
    // Object with a cards array
  } else {
    throw new Error('Unrecognized file format. Expected an Inkwell deck export or a flashcard array.');
  }

  const cards = (data as Record<string, unknown>).cards;
  if (!Array.isArray(cards) || cards.length === 0) {
    throw new Error('No flashcards found in the file.');
  }

  // Validate each card has required fields
  const requiredKeys: (keyof Flashcard)[] = ['id', 'front', 'back', 'deck'];
  const validated: Flashcard[] = [];

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i] as Record<string, unknown>;
    for (const key of requiredKeys) {
      if (!card[key]) {
        throw new Error(`Card at index ${i} is missing required field "${key}".`);
      }
    }
    validated.push(normalizeCard(card));
  }

  return validated;
}

/** Ensure imported cards have sensible defaults for SM-2 fields */
function normalizeCard(raw: Record<string, unknown>): Flashcard {
  return {
    id: String(raw.id),
    documentId: raw.documentId ? String(raw.documentId) : 'imported',
    deck: String(raw.deck),
    front: String(raw.front),
    back: String(raw.back),
    difficulty: (['easy', 'medium', 'hard'].includes(raw.difficulty as string)
      ? raw.difficulty
      : 'medium') as Flashcard['difficulty'],
    easeFactor: typeof raw.easeFactor === 'number' ? raw.easeFactor : 2.5,
    interval: typeof raw.interval === 'number' ? raw.interval : 1,
    repetitions: typeof raw.repetitions === 'number' ? raw.repetitions : 0,
    nextReview: typeof raw.nextReview === 'number' ? raw.nextReview : Date.now(),
    lastReview: typeof raw.lastReview === 'number'
      ? (raw.lastReview as number)
      : null,
    reviewCount: typeof raw.reviewCount === 'number' ? raw.reviewCount : 0,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
  };
}

/**
 * Import cards into the store. Skips duplicates (by id).
 * Returns the count of newly imported cards.
 */
export async function importCards(cards: Flashcard[]): Promise<number> {
  const existing = await getAllFlashcards();
  const existingIds = new Set(existing.map((c) => c.id));
  const newCards = cards.filter((c) => !existingIds.has(c.id));

  if (newCards.length === 0) {
    return 0;
  }

  await saveFlashcards(newCards);
  return newCards.length;
}

/**
 * Read a File object as text.
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsText(file);
  });
}
