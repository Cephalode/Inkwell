import { useState, useEffect } from 'react';
import MarkdownNotesEditor from '../components/notes/MarkdownNotesEditor';
import CornellNotesGenerator from '../components/notes/CornellNotesGenerator';
import Card from '../components/shared/Card';
import Button from '../components/shared/Button';
import EmptyState from '../components/shared/EmptyState';
import { useDocumentStore } from '../store/documentStore';

type NoteTab = 'editor' | 'cornell';

const STORAGE_KEY = 'inkwell_notes';
const OLD_STORAGE_KEY = 'studyforge_notes';

// One-time migration: copy old key to new key if new key doesn't exist yet
function migrateNotesStorage() {
  try {
    const newData = localStorage.getItem(STORAGE_KEY);
    const oldData = localStorage.getItem(OLD_STORAGE_KEY);
    if (!newData && oldData) {
      localStorage.setItem(STORAGE_KEY, oldData);
      localStorage.removeItem(OLD_STORAGE_KEY);
    }
  } catch { /* ignore */ }
}

export default function NotesPage() {
  const documents = useDocumentStore((s) => s.documents);
  const [selectedDoc, setSelectedDoc] = useState('');
  const [tab, setTab] = useState<NoteTab>('editor');
  const [savedNotes, setSavedNotes] = useState<Record<string, string>>({});

  const doc = documents.find((d) => d.id === selectedDoc);

  const handleSaveNote = (content: string) => {
    if (!selectedDoc) return;
    setSavedNotes((prev) => ({ ...prev, [selectedDoc]: content }));
    // Save to localStorage for now
    try {
      const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      existing[selectedDoc] = content;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    } catch { /* ignore */ }
  };

  useEffect(() => {
    migrateNotesStorage();
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      setSavedNotes(saved);
    } catch { /* ignore */ }
  }, []);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white mb-1">📝 Notes</h1>
        <p className="text-slate-400">Write notes, generate Cornell-style notes from your materials</p>
      </div>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <select
          value={selectedDoc}
          onChange={(e) => setSelectedDoc(e.target.value)}
          className="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-200"
        >
          <option value="">Select document (optional)...</option>
          {documents.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <div className="flex gap-1 bg-slate-800/50 rounded-lg p-1 border border-slate-700/50">
          <button
            onClick={() => setTab('editor')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium ${tab === 'editor' ? 'bg-cyan-600 text-white' : 'text-slate-400'}`}
          >Editor</button>
          <button
            onClick={() => setTab('cornell')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium ${tab === 'cornell' ? 'bg-cyan-600 text-white' : 'text-slate-400'}`}
          >Cornell Notes</button>
        </div>
      </div>

      {tab === 'editor' ? (
        <MarkdownNotesEditor
          initialContent={selectedDoc ? (savedNotes[selectedDoc] || '') : ''}
          title={doc?.name || 'Study Notes'}
          onSave={handleSaveNote}
        />
      ) : doc?.parsedText ? (
        <CornellNotesGenerator documentText={doc.parsedText} documentName={doc.name} />
      ) : (
        <EmptyState icon="📝" title="Select a document" description="Choose a document to generate Cornell notes from" />
      )}
    </div>
  );
}
