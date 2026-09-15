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
      <div
        className="px-4 py-2.5"
        style={{
          background: 'color-mix(in srgb, var(--color-surface) 88%, transparent)',
          borderTop: '1px solid var(--color-divider)',
        }}
      >
        <div className="flex items-center justify-center gap-5 text-sm flex-wrap">
          {/* Total Nodes */}
          <span className="flex items-center gap-1.5">
            <span className="font-semibold">{totalNodes}</span>
            <span style={{ opacity: 0.6 }}>nodes</span>
          </span>

          {/* Separator */}
          <span style={{ opacity: 0.4 }}>•</span>

          {/* Total Edges */}
          <span className="flex items-center gap-1.5">
            <span className="font-semibold">{totalEdges}</span>
            <span style={{ opacity: 0.6 }}>edges</span>
          </span>

          {/* Separator */}
          <span style={{ opacity: 0.4 }}>•</span>

          {/* Per-type counts */}
          {typeConfig.map(({ key, shortLabel, color }) => {
            const count = countsByType[key] ?? 0;
            if (count === 0) return null;
            return (
              <span key={key} className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="font-semibold">{count}</span>
                <span style={{ opacity: 0.6 }}>{shortLabel}</span>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
