import type { KGGraph, KGNodeType } from '../../types/knowledgeGraph';

interface GraphStatsProps {
  graph: KGGraph;
}

const typeConfig: { key: KGNodeType; label: string; shortLabel: string; color: string }[] = [
  { key: 'document', label: 'Documents', shortLabel: 'Docs', color: '#14b8a6' },
  { key: 'chapter', label: 'Chapters', shortLabel: 'Chapters', color: '#06b6d4' },
  { key: 'doctype', label: 'Types', shortLabel: 'Types', color: '#3b82f6' },
  { key: 'tag', label: 'Tags', shortLabel: 'Tags', color: '#a855f7' },
  { key: 'course', label: 'Courses', shortLabel: 'Courses', color: '#f59e0b' },
  { key: 'subject', label: 'Subjects', shortLabel: 'Subjects', color: '#22c55e' },
  { key: 'chat', label: 'Chats', shortLabel: 'Chats', color: '#6b7280' },
];

export function GraphStats({ graph }: GraphStatsProps) {
  const totalNodes = graph.nodes.length;
  const totalEdges = graph.edges.length;

  const countsByType: Partial<Record<KGNodeType, number>> = {};
  for (const node of graph.nodes) {
    countsByType[node.type] = (countsByType[node.type] || 0) + 1;
  }

  return (
    <div className="absolute bottom-0 left-0 right-0 z-10">
      <div className="bg-slate-800/80 backdrop-blur-sm border-t border-slate-700/50 px-4 py-2.5">
        <div className="flex items-center justify-center gap-5 text-sm flex-wrap">
          {/* Total Nodes */}
          <span className="flex items-center gap-1.5 text-slate-400">
            <span className="font-semibold text-slate-200">{totalNodes}</span>
            <span>nodes</span>
          </span>

          {/* Separator */}
          <span className="text-slate-600">•</span>

          {/* Total Edges */}
          <span className="flex items-center gap-1.5 text-slate-400">
            <span className="font-semibold text-slate-200">{totalEdges}</span>
            <span>edges</span>
          </span>

          {/* Separator */}
          <span className="text-slate-600">•</span>

          {/* Per-type counts */}
          {typeConfig.map(({ key, shortLabel, color }) => {
            const count = countsByType[key] ?? 0;
            if (count === 0) return null;
            return (
              <span key={key} className="flex items-center gap-1.5 text-slate-400">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="font-semibold text-slate-200">{count}</span>
                <span>{shortLabel}</span>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
