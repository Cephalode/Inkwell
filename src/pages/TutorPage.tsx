import { useState } from 'react';
import TutorMode from '../components/tutor/TutorMode';
import Card from '../components/shared/Card';
import EmptyState from '../components/shared/EmptyState';
import { useDocumentStore } from '../store/documentStore';
import { useProgress } from '../hooks/useProgress';
import { generateUUID } from '../utils/uuid';

export default function TutorPage() {
  const documents = useDocumentStore((s) => s.documents);
  const { trackSession } = useProgress();
  const [selectedDoc, setSelectedDoc] = useState('');

  const doc = documents.find((d) => d.id === selectedDoc);

  const handleSessionEnd = (info: { duration: number; messageCount: number }) => {
    if (info.messageCount === 0) return;
    trackSession({
      id: generateUUID(),
      type: 'tutor',
      documentId: doc?.id,
      duration: info.duration,
      date: Date.now(),
      metadata: { messageCount: info.messageCount },
    });
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white mb-1">🧑‍🏫 AI Tutor</h1>
        <p className="text-slate-400">Active recall with the Socratic method — the AI asks YOU questions</p>
      </div>

      {!doc ? (
        <div>
          <label className="block text-sm text-slate-400 mb-2">Select study material:</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {documents.map((d) => (
              <Card key={d.id} onClick={() => setSelectedDoc(d.id)} className="hover:scale-[1.02] transition-transform cursor-pointer">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{d.type === 'pdf' ? '📄' : '📝'}</span>
                  <div>
                    <p className="text-sm font-semibold text-slate-200">{d.name}</p>
                    <p className="text-xs text-slate-500">{(d.parsedText?.length || 0).toLocaleString()} chars</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
          {documents.length === 0 && (
            <EmptyState icon="📚" title="No documents yet" description="Upload study materials first to start tutoring" />
          )}
        </div>
      ) : (
        <TutorMode documentText={doc.parsedText || ''} documentName={doc.name} documentId={doc.id} onSessionEnd={handleSessionEnd} />
      )}
    </div>
  );
}
