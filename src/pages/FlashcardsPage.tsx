import { useState } from 'react';
import FlashcardDeck from '../components/flashcards/FlashcardDeck';
import Card from '../components/shared/Card';
import Button from '../components/shared/Button';
import EmptyState from '../components/shared/EmptyState';
import Spinner from '../components/shared/Spinner';
import Badge from '../components/shared/Badge';
import { useFlashcardStore } from '../store/flashcardStore';
import { useDocumentStore } from '../store/documentStore';
import { chatCompletion } from '../services/ai/client';
import { FLASHCARD_PROMPT } from '../services/ai/prompts';
import { Flashcard } from '../types/flashcard';

export default function FlashcardsPage() {
  const { flashcards, setFlashcards } = useFlashcardStore();
  const documents = useDocumentStore((s) => s.documents);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<string>('');

  const handleGenerate = async () => {
    const doc = documents.find((d) => d.id === selectedDoc);
    if (!doc?.parsedText) return;
    setIsLoading(true);
    try {
      const result = await chatCompletion([{ role: 'user', content: FLASHCARD_PROMPT(doc.parsedText, 15) }]);
      const parsed = JSON.parse(result.match(/\[.*\]/s)?.[0] || '[]');
      const cards: Flashcard[] = parsed.map((c: any) => ({
        id: crypto.randomUUID(), documentId: doc.id, deck: doc.name,
        front: c.front, back: c.back, difficulty: 'medium' as const,
        nextReview: Date.now(), interval: 1, easeFactor: 2.5, reviewCount: 0, createdAt: Date.now(),
      }));
      setFlashcards(cards);
    } catch { /* handle error */ }
    setIsLoading(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">🃏 Flashcards</h1>
        <p className="text-slate-400">Generate and study flashcards with spaced repetition</p>
      </div>

      <div className="flex items-center gap-3">
        <select value={selectedDoc} onChange={(e) => setSelectedDoc(e.target.value)} className="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-200">
          <option value="">Select document...</option>
          {documents.map((doc) => <option key={doc.id} value={doc.id}>{doc.name}</option>)}
        </select>
        <Button onClick={handleGenerate} isLoading={isLoading} disabled={!selectedDoc}>
          Generate Flashcards
        </Button>
      </div>

      {isLoading ? <div className="flex justify-center py-16"><Spinner /></div> : (
        flashcards.length === 0 ? (
          <EmptyState icon="🃏" title="No flashcards yet" description="Select a document and generate flashcards to start studying" />
        ) : (
          <FlashcardDeck cards={flashcards} onRate={(id, diff) => {
            setFlashcards(flashcards.map((c) => c.id === id ? { ...c, difficulty: diff } : c));
          }} />
        )
      )}
    </div>
  );
}
