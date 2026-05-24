import { useState } from 'react';
import MindMapViewer from '../components/mindmap/MindMapViewer';
import Card from '../components/shared/Card';
import Button from '../components/shared/Button';
import { useDocumentStore } from '../store/documentStore';
import { chatCompletion } from '../services/ai/client';
import { MINDMAP_PROMPT } from '../services/ai/prompts';

export default function MindMapPage() {
  const documents = useDocumentStore((s) => s.documents);
  const [selectedDoc, setSelectedDoc] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mapData, setMapData] = useState<{ nodes: any[]; edges: any[] } | null>(null);

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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">🧠 Knowledge Graph</h1>
        <p className="text-slate-400">Visualize concepts and relationships from your materials</p>
      </div>
      <div className="flex items-center gap-3">
        <select value={selectedDoc} onChange={(e) => { setSelectedDoc(e.target.value); setMapData(null); }} className="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-200">
          <option value="">Select document...</option>
          {documents.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <Button onClick={handleGenerate} isLoading={isLoading} disabled={!selectedDoc}>Generate Mind Map</Button>
      </div>
      {mapData && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-8">
          <div className="flex flex-wrap gap-3 mb-6 justify-center">
            {mapData.nodes.map((node: any) => (
              <div key={node.id} className="px-4 py-2 rounded-full bg-cyan-600/20 border border-cyan-500/30 text-sm text-cyan-300">
                {node.label}
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {mapData.edges.map((edge: any, i: number) => (
              <div key={i} className="text-xs text-slate-400 text-center">
                <span className="text-cyan-400">{edge.source}</span> → <span className="text-teal-400">{edge.label}</span> → <span className="text-cyan-400">{edge.target}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
