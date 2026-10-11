import type { KGNode, KGEdge } from '../types/knowledgeGraph';
import type { TopicMap } from '../types/topicMap';
import type { StudyGuide } from '../types/studyGuide';
import type { FlashcardDeck } from '../types/flashcards';

const TOPIC_COLOR = '#e8b93b';

/**
 * Grafts the learning-suite topic map onto the document knowledge graph so one
 * graph shows documents, chats, chapters, tags, courses, roadmap skills/goals
 * (topics), study guides and flashcard decks — and the links between them.
 *
 * - Topic nodes: one `topic` node per concept (shared concepts are a single node
 *   carrying every course + mastery for the map-style pie/halo rendering), anchored
 *   to its source document (`next-topic`) or course node.
 * - `builds-on` edges between concepts linked inside the topic map.
 * - Guide nodes: one per done study guide, linked to its document (`has-guide`),
 *   and to each topic born from that guide (`builds-on`, mirroring map edges).
 * - Deck nodes: one per done flashcard deck, linked to its course (`has-deck`)
 *   and to any document that is a member of that course.
 */
export function extendGraphWithTopics(
  nodes: KGNode[],
  edges: KGEdge[],
  map: TopicMap | null,
  guides: StudyGuide[] = [],
  decks: FlashcardDeck[] = [],
): { nodes: KGNode[]; edges: KGEdge[] } {
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

  const conceptIds = new Set(map?.topics.filter((t) => !t.id.startsWith('foundation:')).map((t) => t.id) ?? []);
  const topicById = new Map((map?.topics ?? []).map((t) => [t.id, t]));

  // ── Topic nodes (roadmap skills + guide concepts) ──────────────
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
      courseId: t.courseId,
      courseIds: t.courseIds,
    });
    // Anchor: the topic's source document, else its course node.
    const anchor = t.documentId ? `doc:${t.documentId}` : `course:${t.courseId}`;
    if (nodeIds.has(anchor)) addEdge(anchor, t.id, 'next-topic');
  }

  // Concept→concept links from the topic map.
  for (const e of map?.edges ?? []) {
    if (conceptIds.has(e.a) && conceptIds.has(e.b)) addEdge(e.a, e.b, 'builds-on');
  }

  // ── Guide nodes: done study guides, anchored to their document ──
  const guideById = new Map<string, StudyGuide>();
  for (const g of guides) {
    if (g.status !== 'done') continue;
    guideById.set(g.id, g);
    addNode({
      id: `guide:${g.id}`,
      label: g.title,
      type: 'guide',
      parentId: g.id,
      val: 4,
    });
    if (g.documentId && nodeIds.has(`doc:${g.documentId}`)) {
      addEdge(`doc:${g.documentId}`, `guide:${g.id}`, 'has-guide');
    }
    // Topics that came from this guide link to it (builds-on reads naturally:
    // the topic builds on / was distilled into the guide's concept map).
    for (const t of topicById.values()) {
      if (t.guideId === g.id) addEdge(t.id, `guide:${g.id}`, 'builds-on');
    }
  }

  // ── Deck nodes: done flashcard decks, anchored to their course and/or the
  // document/chapter they were generated from (deck.source carries the ids).
  for (const d of decks) {
    if (d.status !== 'done') continue;
    addNode({
      id: `deck:${d.id}`,
      label: d.title,
      type: 'deck',
      parentId: d.id,
      val: 3,
    });
    if (d.course_id && nodeIds.has(`course:${d.course_id}`)) {
      addEdge(`course:${d.course_id}`, `deck:${d.id}`, 'has-deck');
    }
    if (d.source.type === 'document') {
      for (const docId of d.source.ids) {
        if (nodeIds.has(`doc:${docId}`)) addEdge(`doc:${docId}`, `deck:${d.id}`, 'has-deck');
      }
    } else if (d.source.type === 'chapter') {
      // Anchor chapter-sourced decks to the chapter's parent document node —
      // chapter nodes live in the base graph under ids `chapter:<id>`, but
      // deck.source ids are chapter DB ids while chapter nodes use `${parentId}_ch${n}`.
      for (const docId of d.source.ids) {
        if (nodeIds.has(`doc:${docId}`)) addEdge(`doc:${docId}`, `deck:${d.id}`, 'has-deck');
      }
    }
  }

  return { nodes: out, edges: outEdges };
}

export { TOPIC_COLOR };
