import { useCallback } from 'react';
import { exportToAnki } from '../services/export/ankiExport';
import { exportToCSV } from '../services/export/csvExport';
import { exportNotesToPDF } from '../services/export/pdfExport';
import { exportToMarkdown } from '../services/export/markdownExport';
import { Flashcard } from '../types/flashcard';

export function useExport() {
  const exportFlashcards = useCallback((cards: Flashcard[], deckName: string, format: 'anki' | 'csv') => {
    if (format === 'anki') exportToAnki(cards, deckName);
    else exportToCSV(cards, deckName);
  }, []);

  const exportNotes = useCallback((title: string, content: string, format: 'pdf' | 'md') => {
    if (format === 'pdf') exportNotesToPDF(title, content);
    else exportToMarkdown(title, content);
  }, []);

  return { exportFlashcards, exportNotes };
}
