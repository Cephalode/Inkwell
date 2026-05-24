import { saveAs } from 'file-saver';
import { Flashcard } from '../../types/flashcard';

function escapeCSV(str: string): string {
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportToCSV(flashcards: Flashcard[], deckName: string): void {
  const header = 'Front,Back,Difficulty\n';
  const rows = flashcards.map((c) => `${escapeCSV(c.front)},${escapeCSV(c.back)},${c.difficulty}`).join('\n');
  const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8' });
  saveAs(blob, `${deckName.replace(/\s+/g, '_')}_flashcards.csv`);
}
