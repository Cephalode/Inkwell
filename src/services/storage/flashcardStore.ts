import { getDB } from './db';
import { Flashcard } from '../../types/flashcard';

export async function saveFlashcard(card: Flashcard): Promise<void> {
  const db = await getDB();
  await db.put('flashcards', card);
}

export async function saveFlashcards(cards: Flashcard[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('flashcards', 'readwrite');
  await Promise.all([
    ...cards.map((card) => tx.store.put(card)),
    tx.done,
  ]);
}

export async function getAllFlashcards(): Promise<Flashcard[]> {
  const db = await getDB();
  return db.getAll('flashcards');
}

export async function getDueFlashcards(now?: number): Promise<Flashcard[]> {
  const db = await getDB();
  const timestamp = now ?? Date.now();
  const range = IDBKeyRange.upperBound(timestamp);
  return db.getAllFromIndex('flashcards', 'by-review', range);
}

export async function getFlashcardsByDocument(documentId: string): Promise<Flashcard[]> {
  const db = await getDB();
  return db.getAllFromIndex('flashcards', 'by-document', documentId);
}

export async function getFlashcardsByDeck(deck: string): Promise<Flashcard[]> {
  const db = await getDB();
  return db.getAllFromIndex('flashcards', 'by-deck', deck);
}

export async function deleteFlashcard(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('flashcards', id);
}

export async function deleteFlashcardsByDocument(documentId: string): Promise<void> {
  const cards = await getFlashcardsByDocument(documentId);
  const db = await getDB();
  const tx = db.transaction('flashcards', 'readwrite');
  await Promise.all([
    ...cards.map((card) => tx.store.delete(card.id)),
    tx.done,
  ]);
}
