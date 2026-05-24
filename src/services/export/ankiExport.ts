import { saveAs } from 'file-saver';
import { Flashcard } from '../../types/flashcard';

export function exportToAnki(flashcards: Flashcard[], deckName: string): void {
  const lines = flashcards.map((card) => {
    const front = card.front.replace(/\t/g, ' ').replace(/\n/g, '<br>');
    const back = card.back.replace(/\t/g, ' ').replace(/\n/g, '<br>');
    return `${front}\t${back}`;
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  saveAs(blob, `${deckName.replace(/\s+/g, '_')}_anki.txt`);
}
