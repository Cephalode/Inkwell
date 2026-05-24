import { useState } from 'react';
import Button from '../shared/Button';
import Spinner from '../shared/Spinner';

interface MindMapViewerProps {
  onGenerate: () => Promise<{ nodes: any[]; edges: any[] }>;
  isLoading: boolean;
}

export default function MindMapViewer({ onGenerate, isLoading }: MindMapViewerProps) {
  const [data, setData] = useState<{ nodes: any[]; edges: any[] } | null>(null);

  const handleGenerate = async () => {
    const result = await onGenerate();
    setData(result);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-200">🧠 Knowledge Graph</h3>
        <Button onClick={handleGenerate} isLoading={isLoading}>Generate Mind Map</Button>
      </div>
      {isLoading && <div className="flex justify-center py-10"><Spinner /></div>}
      {data && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-8">
          <div className="flex flex-wrap gap-3 mb-6 justify-center">
            {data.nodes.map((node) => (
              <div
                key={node.id}
                className="px-4 py-2 rounded-full bg-cyan-600/20 border border-cyan-500/30 text-sm text-cyan-300"
              >
                {node.label}
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {data.edges.map((edge, i) => (
              <div key={i} className="text-xs text-slate-400 text-center">
                <span className="text-cyan-400">{edge.source}</span>
                {' → '}
                <span className="text-teal-400">{edge.label}</span>
                {' → '}
                <span className="text-cyan-400">{edge.target}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
