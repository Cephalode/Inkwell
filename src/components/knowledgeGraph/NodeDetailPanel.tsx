import { motion, AnimatePresence } from 'framer-motion';
import { HiXMark, HiOutlineDocumentText, HiOutlineHashtag, HiOutlineAcademicCap, HiOutlineChatBubbleLeftRight, HiOutlineTag, HiOutlineBookOpen, HiOutlineDocumentDuplicate } from 'react-icons/hi2';
import { useKnowledgeGraphStore } from '../../store/knowledgeGraphStore';
import type { KGGraph, KGNode, KGNodeType } from '../../types/knowledgeGraph';

interface NodeDetailPanelProps {
  graph: KGGraph;
  onOpenDocument?: (documentId: string) => void;
  /** Topic nodes taught by a roadmap step: open that step in the learning suite. */
  onOpenStep?: (stepId: string) => void;
}

const MASTERY_COLORS: Record<NonNullable<KGNode['mastery']>, string> = {
  0: '#e8b93b',
  1: '#38a6cf',
  2: '#2f9e57',
  3: '#2f9e57',
};

const MASTERY_LABELS: Record<NonNullable<KGNode['mastery']>, string> = {
  0: 'Not started',
  1: 'In progress',
  2: 'Learned',
  3: 'Foundation · assumed known',
};

const typeColors: Record<KGNodeType, string> = {
  document: '#2380a2',
  doctype: '#9c6a24',
  tag: '#6f5fa8',
  course: '#b8547c',
  subject: '#5d8a50',
  chat: '#8a8a8a',
  chapter: '#38a6cf',
  topic: '#e8b93b',
  guide: '#b8547c',
  deck: '#5d8a50',
};

const typeLabels: Record<KGNodeType, string> = {
  document: 'Document',
  doctype: 'Doc Type',
  tag: 'Tag',
  course: 'Course',
  subject: 'Subject',
  chat: 'Chat',
  chapter: 'Chapter',
  topic: 'Topic',
  guide: 'Study Guide',
  deck: 'Card Deck',
};

const typeIcons: Record<KGNodeType, React.ReactNode> = {
  document: <HiOutlineDocumentText className="w-3.5 h-3.5" />,
  doctype: <HiOutlineTag className="w-3.5 h-3.5" />,
  tag: <HiOutlineHashtag className="w-3.5 h-3.5" />,
  course: <HiOutlineAcademicCap className="w-3.5 h-3.5" />,
  subject: <HiOutlineBookOpen className="w-3.5 h-3.5" />,
  chat: <HiOutlineChatBubbleLeftRight className="w-3.5 h-3.5" />,
  chapter: <HiOutlineDocumentDuplicate className="w-3.5 h-3.5" />,
  topic: <HiOutlineAcademicCap className="w-3.5 h-3.5" />,
  guide: <HiOutlineBookOpen className="w-3.5 h-3.5" />,
  deck: <HiOutlineDocumentDuplicate className="w-3.5 h-3.5" />,
};

function getConnectedNodes(node: KGNode, graph: KGGraph): KGNode[] {
  const connectedIds = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.source === node.id) connectedIds.add(edge.target);
    if (edge.target === node.id) connectedIds.add(edge.source);
  }
  return graph.nodes.filter((n) => connectedIds.has(n.id));
}

function getConnectedByType(node: KGNode, graph: KGGraph, type: KGNodeType): KGNode[] {
  return getConnectedNodes(node, graph).filter((n) => n.type === type);
}

/** Topic nodes take their mastery colour (matches GraphViewer); everything else its type colour. */
function nodeColor(node: KGNode): string {
  return node.type === 'topic' ? MASTERY_COLORS[node.mastery ?? 0] : typeColors[node.type];
}

export function NodeDetailPanel({ graph, onOpenDocument, onOpenStep }: NodeDetailPanelProps) {
  const { selectedNode, setSelectedNode } = useKnowledgeGraphStore();

  if (!selectedNode) return null;

  const connections = getConnectedNodes(selectedNode, graph);
  const color = nodeColor(selectedNode);
  const stepId = selectedNode.type === 'topic' ? selectedNode.stepId : undefined;

  return (
    <AnimatePresence>
      {selectedNode && (
        <motion.div
          key="detail-panel"
          initial={{ x: 320, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 320, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 250 }}
          className="absolute top-4 right-4 z-10 w-80"
        >
          <div
            className="card overflow-hidden"
            style={{
              background: 'color-mix(in srgb, var(--color-surface) 88%, transparent)',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--color-divider)' }}>
              <span className="text-sm font-medium" style={{ opacity: 0.6 }}>Node Details</span>
              <button
                onClick={() => setSelectedNode(null)}
                className="p-1 transition-colors text-[var(--color-neutral-600)] hover:text-[var(--color-text)] hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)]"
                style={{ borderRadius: 'var(--radius-md)' }}
              >
                <HiXMark className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 space-y-4">
              {/* Type Badge */}
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium"
                  style={{ backgroundColor: color, color: '#fff', borderRadius: 'var(--radius-sm)' }}
                >
                  {typeIcons[selectedNode.type]}
                  {typeLabels[selectedNode.type]}
                </span>
              </div>

              {/* Label */}
              <h3 className="text-lg leading-snug break-words">
                {selectedNode.label}
              </h3>

              {/* Connections Count */}
              <div className="flex items-center gap-2 text-sm" style={{ opacity: 0.7 }}>
                <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-accent)' }} />
                <span>{connections.length} connection{connections.length !== 1 ? 's' : ''}</span>
              </div>

              {/* Divider */}
              <div className="border-t" style={{ borderColor: 'var(--color-divider)' }} />

              {/* Type-specific details */}
              {selectedNode.type === 'document' && (
                <div className="space-y-3">
                  {selectedNode.parentId && (
                    <div>
                      <p className="text-xs uppercase tracking-wider mb-1" style={{ opacity: 0.5 }}>Parent Document</p>
                      <p className="text-sm" style={{ opacity: 0.75 }}>{selectedNode.parentId}</p>
                    </div>
                  )}
                  <button
                    onClick={() => onOpenDocument?.(selectedNode.id)}
                    className="btn btn-ghost w-full"
                    style={{ border: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)' }}
                  >
                    <HiOutlineDocumentText className="w-4 h-4" />
                    Open Document
                  </button>
                </div>
              )}

              {selectedNode.type === 'tag' && (
                <div>
                  <p className="text-xs uppercase tracking-wider mb-1" style={{ opacity: 0.5 }}>Documents with this tag</p>
                  <p className="text-sm" style={{ opacity: 0.75 }}>
                    {getConnectedByType(selectedNode, graph, 'document').length} document{getConnectedByType(selectedNode, graph, 'document').length !== 1 ? 's' : ''}
                  </p>
                </div>
              )}

              {selectedNode.type === 'course' && (
                <div>
                  <p className="text-xs uppercase tracking-wider mb-1" style={{ opacity: 0.5 }}>Documents in course</p>
                  <p className="text-sm" style={{ opacity: 0.75 }}>
                    {getConnectedByType(selectedNode, graph, 'document').length} document{getConnectedByType(selectedNode, graph, 'document').length !== 1 ? 's' : ''}
                  </p>
                </div>
              )}

              {selectedNode.type === 'topic' && (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs uppercase tracking-wider mb-1" style={{ opacity: 0.5 }}>Mastery</p>
                    <p className="flex items-center gap-2 text-sm" style={{ opacity: 0.85 }}>
                      <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                      {MASTERY_LABELS[selectedNode.mastery ?? 0]}
                    </p>
                  </div>
                  {stepId && (
                    <button
                      onClick={() => onOpenStep?.(stepId)}
                      className="btn btn-ghost w-full"
                      style={{ border: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)' }}
                    >
                      <HiOutlineBookOpen className="w-4 h-4" />
                      Open topic
                    </button>
                  )}
                </div>
              )}

              {/* Connected Nodes List */}
              {connections.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-wider mb-2" style={{ opacity: 0.5 }}>Connected to</p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {connections.map((conn) => (
                      <div
                        key={conn.id}
                        className="flex items-center gap-2 px-2 py-1.5 transition-colors hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)]"
                        style={{ borderRadius: 'var(--radius-md)' }}
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: nodeColor(conn) }}
                        />
                        <span className="text-sm truncate">{conn.label}</span>
                        <span className="ml-auto text-xs" style={{ opacity: 0.5 }}>{typeLabels[conn.type]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
