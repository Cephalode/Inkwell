import type { KGNode, KGEdge } from '../types/knowledgeGraph';
import type { TopicMap } from '../types/topicMap';

const TOPIC_COLOR = '#e8b93b';

/** Extends the document knowledge graph with the topic map's roadmap topics:
 *  one `topic` node per concept (shared concepts are a single node carrying every
 *  course's mastery and roadmap step, so the viewer can colour it and deep-link
 *  into the learning suite), `next-topic` edges to its source document (or course
 *  when there is no document), and `builds-on` edges between concepts linked
 *  inside the map. */
export function extendGraphWithTopics(
  nodes: KGNode[],
  edges: KGEdge[],
  map: TopicMap | null,
): { nodes: KGNode[]; edges: KGEdge[] } {
  if (!map || map.topics.length === 0) return { nodes, edges };

  const out = [...nodes];
  const outEdges = [...edges];
  const nodeIds = new Set(out.map((n) => n.id));
  const edgeKeys = new Set(outEdges.map((e) => `${e.source}->${e.target}::${e.type}`));

  const addNode = (n: KGNode) => {
    if (nodeIds.has(n.id)) return;
    nodeIds.add(n.id);
    out.push(n);
  };
  const addEdge = (source: string, target: string, type: KGEdge['type']) => {
    const key = `${source}->${target}::${type}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    outEdges.push({ source, target, type });
  };

  // Same-course concept→concept links from the topic map (undirected a|b keys).
  const conceptIds = new Set(map.topics.filter((t) => !t.id.startsWith('foundation:')).map((t) => t.id));
  const topicById = new Map(map.topics.map((t) => [t.id, t]));

  for (const t of topicById.values()) {
    // ponytail: skip foundation (assumed-known) topics — no source doc to anchor
    // to, so they'd float as orphans; add course:me anchors if they're ever wanted
    if (t.id.startsWith('foundation:')) continue;
    addNode({
      id: t.id,
      label: t.label,
      type: 'topic',
      parentId: t.documentId ?? t.guideId,
      val: 3,
      mastery: t.mastery,
      stepId: t.stepId,
    });
    // Anchor: the topic's source document, else its course node.
    const anchor = t.documentId ? `doc:${t.documentId}` : `course:${t.courseId}`;
    if (nodeIds.has(anchor)) addEdge(anchor, t.id, 'next-topic');
  }

  for (const e of map.edges) {
    if (conceptIds.has(e.a) && conceptIds.has(e.b)) addEdge(e.a, e.b, 'builds-on');
  }

  return { nodes: out, edges: outEdges };
}

export { TOPIC_COLOR };
