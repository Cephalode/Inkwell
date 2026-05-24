import { useState } from 'react';
import ConceptExplainer from '../components/concepts/ConceptExplainer';
import AudioOverview from '../components/audio/AudioOverview';
import Card from '../components/shared/Card';
import EmptyState from '../components/shared/EmptyState';
import { useDocumentStore } from '../store/documentStore';

type ToolTab = 'explainer' | 'audio';

export default function ConceptPage() {
  const documents = useDocumentStore((s) => s.documents);
  const [selectedDoc, setSelectedDoc] = useState('');
  const [tab, setTab] = useState<ToolTab>('explainer');

  const doc = documents.find((d) => d.id === selectedDoc);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">🔬 Concepts & Audio</h1>
        <p className="text-slate-400">Explain concepts with analogies or listen to an audio overview</p>
      </div>

      <div className="flex items-center gap-3">
        <select value={selectedDoc} onChange={(e) => setSelectedDoc(e.target.value)} className="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-200">
          <option value="">Select document...</option>
          {documents.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <div className="flex gap-1 bg-slate-800/50 rounded-lg p-1 border border-slate-700/50">
          <button onClick={() => setTab('explainer')} className={`px-3 py-1.5 rounded-md text-xs font-medium ${tab === 'explainer' ? 'bg-cyan-600 text-white' : 'text-slate-400'}`}>Concept Explainer</button>
          <button onClick={() => setTab('audio')} className={`px-3 py-1.5 rounded-md text-xs font-medium ${tab === 'audio' ? 'bg-cyan-600 text-white' : 'text-slate-400'}`}>Audio Overview</button>
        </div>
      </div>

      {doc?.parsedText ? (
        tab === 'explainer' ? (
          <ConceptExplainer documentText={doc.parsedText} />
        ) : (
          <AudioOverview documentText={doc.parsedText} documentName={doc.name} />
        )
      ) : (
        <EmptyState icon="🔬" title="Select a document" description="Choose a document to explore concepts or generate audio overviews" />
      )}
    </div>
  );
}
