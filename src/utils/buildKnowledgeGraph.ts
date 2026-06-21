import type { DocumentFile, ChapterDocument } from '../types/document';
import type { Course } from '../types/course';
import type { ChatSession } from '../types/chat';
import type { KGNode, KGEdge, KGGraph } from '../types/knowledgeGraph';

/**
 * Builds a knowledge-graph dataset from the app's documents, courses, chat sessions,
 * and chapter subdocuments.
 *
 * Prefixed IDs avoid collisions across entity types:
 *   "doc:<id>"  "type:<doctype>"  "tag:<tag>"  "course:<id>"  "chat:<id>"  "chapter:<id>"
 *
 * Set-based tracking deduplicates nodes and edges.
 */
export function buildKnowledgeGraph(
  documents: DocumentFile[],
  courses: Course[],
  chats: ChatSession[] = [],
  chapters: ChapterDocument[] = [],
): KGGraph {
  const nodes: KGNode[] = [];
  const edges: KGEdge[] = [];

  const nodeIds = new Set<string>();
  const edgeKeys = new Set<string>();

  function addNode(node: KGNode): void {
    if (nodeIds.has(node.id)) return;
    nodeIds.add(node.id);
    nodes.push(node);
  }

  function addEdge(source: string, target: string, type: KGEdge['type'], label?: string): void {
    const key = `${source}->${target}::${type}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ source, target, type, label });
  }

  // ── Documents ──────────────────────────────────────────────
  for (const doc of documents) {
    const docNodeId = `doc:${doc.id}`;
    addNode({
      id: docNodeId,
      label: doc.name,
      type: 'document',
      parentId: doc.id,
      val: 4,
    });

    // doctype node + edge
    const typeNodeId = `type:${doc.type}`;
    addNode({
      id: typeNodeId,
      label: doc.type.toUpperCase(),
      type: 'doctype',
      val: 8,
    });
    addEdge(docNodeId, typeNodeId, 'is-type');

    // tag nodes + edges
    for (const tag of doc.tags) {
      const tagNodeId = `tag:${tag}`;
      addNode({
        id: tagNodeId,
        label: tag,
        type: 'tag',
        val: 3,
      });
      addEdge(docNodeId, tagNodeId, 'has-tag');
    }
  }

  // ── Courses ────────────────────────────────────────────────
  for (const course of courses) {
    const courseNodeId = `course:${course.id}`;
    addNode({
      id: courseNodeId,
      label: course.name,
      type: 'course',
      parentId: course.id,
      val: 10,
    });

    // edges from each document in the course → course node
    for (const docId of course.documentIds) {
      const docNodeId = `doc:${docId}`;
      // only add edge if the document node exists
      if (nodeIds.has(docNodeId)) {
        addEdge(docNodeId, courseNodeId, 'in-course');
      }
    }
  }

  // ── Chat Sessions ──────────────────────────────────────────
  for (const chat of chats) {
    const chatNodeId = `chat:${chat.id}`;
    addNode({
      id: chatNodeId,
      label: chat.title || 'Untitled Chat',
      type: 'chat',
      parentId: chat.id,
      val: 2,
    });

    // direct link to a single document (if set)
    if (chat.documentId) {
      const docNodeId = `doc:${chat.documentId}`;
      if (nodeIds.has(docNodeId)) {
        addEdge(chatNodeId, docNodeId, 'related-chat');
      }
    }

    // also link via citations in messages
    const citedDocIds = new Set<string>();
    for (const msg of chat.messages) {
      if (msg.citations) {
        for (const cit of msg.citations) {
          citedDocIds.add(cit.documentId);
        }
      }
    }
    for (const docId of citedDocIds) {
      const docNodeId = `doc:${docId}`;
      if (nodeIds.has(docNodeId)) {
        addEdge(chatNodeId, docNodeId, 'related-chat');
      }
    }
  }

  // ── Chapter Subdocuments ──────────────────────────────────
  for (const ch of chapters) {
    const chapterNodeId = `chapter:${ch.id}`;
    addNode({
      id: chapterNodeId,
      label: ch.chapterTitle,
      type: 'chapter',
      parentId: ch.id,
      val: 2,
    });

    // edge from chapter → parent document (ONLY link — no tag edges)
    const docNodeId = `doc:${ch.parentId}`;
    if (nodeIds.has(docNodeId)) {
      addEdge(chapterNodeId, docNodeId, 'is-chapter-of');
    }
  }

  return { nodes, edges };
}
