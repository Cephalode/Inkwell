import { useState, useRef, useCallback } from 'react';
import { HiDownload, HiUpload, HiCheckCircle, HiExclamation } from 'react-icons/hi';
import Button from '../shared/Button';
import Card from '../shared/Card';
import Badge from '../shared/Badge';
import { Flashcard } from '../../types/flashcard';
import {
  exportDeckToFile,
  exportAllDecks,
  parseImportFile,
  importCards,
  readFileAsText,
} from '../../services/deckTransfer';

interface ExportImportPanelProps {
  flashcards: Flashcard[];
  onImportComplete: () => void;
}

export default function ExportImportPanel({ flashcards, onImportComplete }: ExportImportPanelProps) {
  const [status, setStatus] = useState<'idle' | 'exporting' | 'importing' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [importPreview, setImportPreview] = useState<Flashcard[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---------- Export ----------
  const handleExportAll = useCallback(async () => {
    setStatus('exporting');
    try {
      await exportAllDecks();
      setStatus('success');
      setMessage(`Exported ${flashcards.length} card${flashcards.length !== 1 ? 's' : ''} successfully.`);
    } catch (err: any) {
      setStatus('error');
      setMessage(err.message || 'Export failed.');
    }
  }, [flashcards.length]);

  const handleExportDeck = useCallback(
    (deckName: string) => {
      const deckCards = flashcards.filter((c) => c.deck === deckName);
      if (deckCards.length === 0) return;
      setStatus('exporting');
      try {
        exportDeckToFile(deckCards, deckName);
        setStatus('success');
        setMessage(`Exported "${deckName}" (${deckCards.length} cards).`);
      } catch (err: any) {
        setStatus('error');
        setMessage(err.message || 'Export failed.');
      }
    },
    [flashcards],
  );

  // ---------- Import ----------
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus('importing');
    setMessage('');

    try {
      const text = await readFileAsText(file);
      const cards = parseImportFile(text);
      setImportPreview(cards);
      setStatus('idle');
    } catch (err: any) {
      setStatus('error');
      setMessage(err.message || 'Failed to parse file.');
      setImportPreview(null);
    }

    // Reset file input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleConfirmImport = useCallback(async () => {
    if (!importPreview) return;
    setStatus('importing');
    try {
      const count = await importCards(importPreview);
      setImportPreview(null);
      setStatus('success');
      setMessage(`Imported ${count} new card${count !== 1 ? 's' : ''}.${count === 0 ? ' (duplicates skipped)' : ''}`);
      onImportComplete();
    } catch (err: any) {
      setStatus('error');
      setMessage(err.message || 'Import failed.');
    }
  }, [importPreview, onImportComplete]);

  const handleCancelImport = useCallback(() => {
    setImportPreview(null);
    setStatus('idle');
    setMessage('');
  }, []);

  // Derive unique deck names for selective export
  const deckNames = [...new Set(flashcards.map((c) => c.deck))].sort();

  return (
    <div className="space-y-4">
      {/* Status Banner */}
      {status === 'success' && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
          <HiCheckCircle className="w-5 h-5 text-green-400 shrink-0" />
          <p className="text-sm text-green-300">{message}</p>
        </div>
      )}
      {status === 'error' && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
          <HiExclamation className="w-5 h-5 text-red-400 shrink-0" />
          <p className="text-sm text-red-300">{message}</p>
        </div>
      )}

      {/* Import Preview */}
      {importPreview && (
        <Card>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-200">
                Import Preview
              </h4>
              <Badge color="cyan">{importPreview.length} cards</Badge>
            </div>
            <div className="max-h-40 overflow-y-auto space-y-1 pr-1 scrollbar-thin scrollbar-thumb-slate-700">
              {importPreview.slice(0, 20).map((card) => (
                <div
                  key={card.id}
                  className="flex items-center gap-2 p-2 rounded bg-slate-700/40 text-xs"
                >
                  <Badge color="gray">{card.deck}</Badge>
                  <span className="text-slate-300 truncate">{card.front}</span>
                </div>
              ))}
              {importPreview.length > 20 && (
                <p className="text-xs text-slate-500 text-center pt-1">
                  …and {importPreview.length - 20} more
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleConfirmImport} isLoading={status === 'importing'}>
                Confirm Import
              </Button>
              <Button size="sm" variant="ghost" onClick={handleCancelImport}>
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Export */}
        <Card>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <HiDownload className="w-5 h-5 text-cyan-400" />
              <h4 className="text-sm font-semibold text-slate-200">Export</h4>
            </div>
            <p className="text-xs text-slate-400">
              Download your flashcards as a JSON file for backup or sharing.
            </p>
            <div className="space-y-2">
              <Button
                size="sm"
                className="w-full"
                onClick={handleExportAll}
                disabled={flashcards.length === 0}
                isLoading={status === 'exporting'}
              >
                Export All ({flashcards.length} cards)
              </Button>
              {deckNames.length > 1 && (
                <div className="space-y-1">
                  <p className="text-xs text-slate-500 font-medium">Or export a single deck:</p>
                  {deckNames.map((name) => {
                    const count = flashcards.filter((c) => c.deck === name).length;
                    return (
                      <button
                        key={name}
                        onClick={() => handleExportDeck(name)}
                        className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs bg-slate-700/50 hover:bg-slate-700 border border-slate-600/50 transition-colors text-slate-300"
                      >
                        <span className="truncate">{name}</span>
                        <Badge color="gray">{count}</Badge>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Import */}
        <Card>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <HiUpload className="w-5 h-5 text-teal-400" />
              <h4 className="text-sm font-semibold text-slate-200">Import</h4>
            </div>
            <p className="text-xs text-slate-400">
              Load flashcards from a previously exported JSON file.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.inkwell.json"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              size="sm"
              variant="secondary"
              className="w-full"
              onClick={() => fileInputRef.current?.click()}
              isLoading={status === 'importing' && !importPreview}
            >
              Choose File to Import
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
