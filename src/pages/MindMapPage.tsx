import { useState } from 'react';
import MindMapViewer from '../components/mindmap/MindMapViewer';
import Card from '../components/shared/Card';
import Button from '../components/shared/Button';
import { useDocumentStore } from '../store/documentStore';
import { chatCompletion } from '../services/ai/client';
import { MINDMAP_PROMPT } from '../services/ai/prompts';
import type { MindMapNode, MindMapEdge } from '../types/mindmap';

export default function MindMapPage() {
  const documents = useDocumentStore((s) => s.documents);
  const [selectedDoc, setSelectedDoc] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mapData, setMapData] = useState<{ nodes: MindMapNode[]; edges: MindMapEdge[] } | null>(null);

  const doc = documents.find((d) => d.id === selectedDoc);

  const handleGenerate = async () => {
    if (!doc?.parsedText) return;
    setIsLoading(true);
    try {
      const result = await chatCompletion([{ role: 'user', content: MINDMAP_PROMPT(doc.parsedText) }]);
      const jsonStr = result.match(/\{[\s\S]*\}/)?.[0] || '{"nodes":[],"edges":[]}';
      setMapData(JSON.parse(jsonStr));
    } catch { setMapData({ nodes: [], edges: [] }); }
    finally { setIsLoading(false); }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white mb-1">🧠 Knowledge Graph</h1>
        <p className="text-slate-400">Visualize concepts and relationships from your materials</p>
      </div>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <select
          value={selectedDoc}
          onChange={(e) => { setSelectedDoc(e.target.value); setMapData(null); }}
          className="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-200"
        >
          <option value="">Select document...</option>
          {documents.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <Button onClick={handleGenerate} isLoading={isLoading} disabled={!selectedDoc}>
          Generate Mind Map
        </Button>
      </div>
      {isLoading && (
        <div className="flex justify-center py-10">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
        </div>
      )}
      {mapData && <div className="overflow-x-auto"><MindMapViewer nodes={mapData.nodes} edges={mapData.edges} /></div>}
    </div>
  );
}
