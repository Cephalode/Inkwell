import { motion, AnimatePresence } from 'framer-motion';
import { HiXMark, HiOutlineDocumentText, HiOutlineHashtag, HiOutlineAcademicCap, HiOutlineChatBubbleLeftRight, HiOutlineTag, HiOutlineBookOpen } from 'react-icons/hi2';
import { useKnowledgeGraphStore } from '../../store/knowledgeGraphStore';
import type { KGGraph, KGNode, KGNodeType } from '../../types/knowledgeGraph';

interface NodeDetailPanelProps {
  graph: KGGraph;
  onOpenDocument?: (documentId: string) => void;
}

const typeColors: Record<KGNodeType, string> = {
  document: '#14b8a6',
  doctype: '#3b82f6',
  tag: '#a855f7',
  course: '#f59e0b',
  subject: '#22c55e',
  chat: '#6b7280',
};

const typeLabels: Record<KGNodeType, string> = {
  document: 'Document',
  doctype: 'Doc Type',
  tag: 'Tag',
  course: 'Course',
  subject: 'Subject',
  chat: 'Chat',
};

const typeIcons: Record<KGNodeType, React.ReactNode> = {
  document: <HiOutlineDocumentText className="w-3.5 h-3.5" />,
  doctype: <HiOutlineTag className="w-3.5 h-3.5" />,
  tag: <HiOutlineHashtag className="w-3.5 h-3.5" />,
  course: <HiOutlineAcademicCap className="w-3.5 h-3.5" />,
  subject: <HiOutlineBookOpen className="w-3.5 h-3.5" />,
  chat: <HiOutlineChatBubbleLeftRight className="w-3.5 h-3.5" />,
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

export function NodeDetailPanel({ graph, onOpenDocument }: NodeDetailPanelProps) {
  const { selectedNode, setSelectedNode } = useKnowledgeGraphStore();

  if (!selectedNode) return null;

  const connections = getConnectedNodes(selectedNode, graph);
  const color = typeColors[selectedNode.type];

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
          <div className="bg-slate-800/90 backdrop-blur-sm border border-slate-700/50 rounded-xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
              <span className="text-sm font-medium text-slate-400">Node Details</span>
              <button
                onClick={() => setSelectedNode(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-700/50 transition-colors"
              >
                <HiXMark className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 space-y-4">
              {/* Type Badge */}
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-white"
                  style={{ backgroundColor: color }}
                >
                  {typeIcons[selectedNode.type]}
                  {typeLabels[selectedNode.type]}
                </span>
              </div>

              {/* Label */}
              <h3 className="text-lg font-semibold text-slate-100 leading-snug break-words">
                {selectedNode.label}
              </h3>

              {/* Connections Count */}
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-teal-500" />
                <span>{connections.length} connection{connections.length !== 1 ? 's' : ''}</span>
              </div>

              {/* Divider */}
              <div className="border-t border-slate-700/50" />

              {/* Type-specific details */}
              {selectedNode.type === 'document' && (
                <div className="space-y-3">
                  {selectedNode.parentId && (
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Parent Document</p>
                      <p className="text-sm text-slate-300">{selectedNode.parentId}</p>
                    </div>
                  )}
                  <button
                    onClick={() => onOpenDocument?.(selectedNode.id)}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-teal-500/10 border border-teal-500/30 text-teal-400 text-sm font-medium hover:bg-teal-500/20 transition-colors"
                  >
                    <HiOutlineDocumentText className="w-4 h-4" />
                    Open Document
                  </button>
                </div>
              )}

              {selectedNode.type === 'tag' && (
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Documents with this tag</p>
                  <p className="text-sm text-slate-300">
                    {getConnectedByType(selectedNode, graph, 'document').length} document{getConnectedByType(selectedNode, graph, 'document').length !== 1 ? 's' : ''}
                  </p>
                </div>
              )}

              {selectedNode.type === 'course' && (
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Documents in course</p>
                  <p className="text-sm text-slate-300">
                    {getConnectedByType(selectedNode, graph, 'document').length} document{getConnectedByType(selectedNode, graph, 'document').length !== 1 ? 's' : ''}
                  </p>
                </div>
              )}

              {/* Connected Nodes List */}
              {connections.length > 0 && (
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Connected to</p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {connections.map((conn) => (
                      <div
                        key={conn.id}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-700/30 transition-colors"
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: typeColors[conn.type] }}
                        />
                        <span className="text-sm text-slate-300 truncate">{conn.label}</span>
                        <span className="ml-auto text-xs text-slate-500">{typeLabels[conn.type]}</span>
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
