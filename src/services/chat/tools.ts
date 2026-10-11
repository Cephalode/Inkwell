/**
 * Tool definitions and executor for the agentic chat system.
 *
 * Provides OpenAI-function-calling-compatible tool schemas that the LLM can
 * invoke, plus a runtime dispatcher (`executeToolCall`) that routes each call
 * to the appropriate implementation backed by the API client and Zustand stores.
 *
 * ⚠  This module runs *outside* React components — all store access must go
 *     through `store.getState()`, never through hooks.
 */

import {
  listDocuments,
  getDocument,
  listChapters,
  getChapter,
  classifyDocument,
  createPracticeTest,
  generatePracticeTest,
  createFlashcardDeck,
  generateFlashcardDeck,
  generatePodcast,
} from '../api/client';
import { chatCompletion } from '../ai/client';
import { SUMMARY_PROMPTS } from '../ai/prompts';
import { useDocumentStore } from '../../store/documentStore';
import { useUIStore } from '../../store/uiStore';
import { useChatStore } from '../../store/chatStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>; // JSON Schema object
  };
}

// ---------------------------------------------------------------------------
// Tool implementations (all async, no React hooks)
// ---------------------------------------------------------------------------

async function handleListDocuments(): Promise<string> {
  const docs = await listDocuments();
  return JSON.stringify(
    docs.map((d) => ({
      id: d.id,
      name: d.name,
      type: d.type,
      tags: d.tags,
      classifyStatus: d.classifyStatus,
    })),
  );
}

async function handleGetDocument(args: Record<string, unknown>): Promise<string> {
  const id = args.id as string;
  if (!id) return 'Error: "id" parameter is required.';
  const doc = await getDocument(id);
  return JSON.stringify({
    id: doc.id,
    name: doc.name,
    type: doc.type,
    mimeType: doc.mimeType,
    size: doc.size,
    parsedText: doc.parsedText ? doc.parsedText.slice(0, 500) + (doc.parsedText.length > 500 ? `... [truncated, ${doc.parsedText.length} total chars]` : '') : null,
    thumbnail: doc.thumbnail,
    chapterMarkers: doc.chapterMarkers,
    tags: doc.tags,
    classifyStatus: doc.classifyStatus,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  });
}

async function handleListChapters(args: Record<string, unknown>): Promise<string> {
  const parentId = args.parentId as string;
  if (!parentId) return 'Error: "parentId" parameter is required.';
  const chapters = await listChapters(parentId);
  return JSON.stringify(
    chapters.map((c) => ({
      id: c.id,
      chapterIndex: c.chapterIndex,
      chapterTitle: c.chapterTitle,
      startPage: c.startPage,
      endPage: c.endPage,
      tags: c.tags,
      parsedText: c.parsedText ? c.parsedText.slice(0, 200) + (c.parsedText.length > 200 ? `... [truncated, ${c.parsedText.length} total chars]` : '') : null,
    })),
  );
}

async function handleGetChapter(args: Record<string, unknown>): Promise<string> {
  const id = args.id as string;
  if (!id) return 'Error: "id" parameter is required.';

  // First try the chapters table endpoint. This works for chapters saved via
  // the chapter-extraction flow (id format `${parentId}_ch${index}`).
  let chapter: Awaited<ReturnType<typeof getChapter>> | null = null;
  try {
    chapter = await getChapter(id);
  } catch {
    // Fall through to the document fallback below.
    // (Converted-textbook chapters are stored as rows in the `documents` table
    // with a textbook_id, so their id is a document UUID — the chapters
    // endpoint returns 404 for them.)
  }

  if (chapter) {
    return JSON.stringify({
      id: chapter.id,
      parentId: chapter.parentId,
      chapterTitle: chapter.chapterTitle,
      chapterIndex: chapter.chapterIndex,
      startPage: chapter.startPage,
      endPage: chapter.endPage,
      parsedText: chapter.parsedText ? chapter.parsedText.slice(0, 2000) + (chapter.parsedText.length > 2000 ? `... [truncated, ${chapter.parsedText.length} total chars]` : '') : null,
      tags: chapter.tags,
      createdAt: chapter.createdAt,
      updatedAt: chapter.updatedAt,
    });
  }

  // Fallback: the id may be a document UUID (converted-textbook chapter).
  // Fetch it via the documents endpoint and present it in a chapter-like shape.
  try {
    const doc = await getDocument(id);
    const title = doc.name.replace(/^\d+\s+/, '').replace(/\.[^.]+$/, '') || doc.name;
    return JSON.stringify({
      id: doc.id,
      parentId: doc.textbookId ?? doc.id,
      chapterTitle: doc.chapterTitle ?? title,
      chapterIndex: doc.chapterIndex ?? 0,
      startPage: doc.startPage ?? null,
      endPage: doc.endPage ?? null,
      parsedText: doc.parsedText ? doc.parsedText.slice(0, 2000) + (doc.parsedText.length > 2000 ? `... [truncated, ${doc.parsedText.length} total chars]` : '') : null,
      tags: doc.tags,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      _source: 'document',
    });
  } catch (err) {
    return `Error: Could not find a chapter or document with id "${id}". (${err instanceof Error ? err.message : String(err)})`;
  }
}

async function handleClassifyDocument(args: Record<string, unknown>): Promise<string> {
  const id = args.id as string;
  if (!id) return 'Error: "id" parameter is required.';
  const result = await classifyDocument(id);
  return JSON.stringify(result);
}

async function handleSummarize(args: Record<string, unknown>): Promise<string> {
  let text = args.text as string;
  if (!text) return 'Error: "text" parameter is required.';
  if (text.length > 8000) text = text.slice(0, 8000) + `... [truncated from ${text.length} chars]`;
  const type = (args.type as 'tldr' | 'keypoints') || 'keypoints';
  const promptFn = SUMMARY_PROMPTS[type] ?? SUMMARY_PROMPTS.keypoints;
  const systemPrompt = promptFn(text);

  const result = await chatCompletion([{ role: 'user', content: systemPrompt }]);
  return result;
}

async function handleSearchDocuments(args: Record<string, unknown>): Promise<string> {
  const query = (args.query as string ?? '').toLowerCase().trim();
  if (!query) return 'Error: "query" parameter is required.';

  const { documents } = useDocumentStore.getState();

  const results = documents.filter(
    (d) =>
      d.name.toLowerCase().includes(query) ||
      d.tags.some((t) => t.toLowerCase().includes(query)),
  );

  return JSON.stringify(
    results.map((d) => ({
      id: d.id,
      name: d.name,
      type: d.type,
      tags: d.tags,
      classifyStatus: d.classifyStatus,
    })),
  );
}

/** Generator tools (E7 / PRD 7): chat is the command line for every generator. */

/** Explicit documentId arg, else the document currently open in the viewer. */
function resolveDocumentId(args: Record<string, unknown>): string | null {
  const explicit = args.documentId as string | undefined;
  if (explicit) return explicit;
  return useDocumentStore.getState().currentDocument?.id ?? null;
}

/** Drain a generation SSE stream to completion (the pipeline stops on disconnect). */
async function drainGeneration(res: Response): Promise<void> {
  await res.text();
}

async function handleGenerateQuiz(args: Record<string, unknown>): Promise<string> {
  const documentId = resolveDocumentId(args);
  if (!documentId) return 'Error: no documentId provided and no document is currently open.';
  const count = Math.max(1, Math.min(50, Number(args.count) || 10));
  const focus = typeof args.focus === 'string' ? args.focus.trim() : '';
  const test = await createPracticeTest({
    title: 'Quiz from chat',
    source: { type: 'document', ids: [documentId] },
    config: { numQuestions: count, instructions: focus || undefined },
  });
  await drainGeneration(await generatePracticeTest(test.id));
  const status = (await (await fetch(`/api/practice-tests/${test.id}`)).json()) as { status: string };
  return JSON.stringify({ status: status.status === 'done' ? 'done' : status.status, testId: test.id, url: `/tests/${test.id}`, questions: count });
}

async function handleGenerateFlashcards(args: Record<string, unknown>): Promise<string> {
  const documentId = resolveDocumentId(args);
  if (!documentId) return 'Error: no documentId provided and no document is currently open.';
  const count = Math.max(1, Math.min(50, Number(args.count) || 20));
  const instructions = typeof args.instructions === 'string' ? args.instructions.trim() : '';
  const deck = await createFlashcardDeck({
    title: 'Deck from chat',
    source: { type: 'document', ids: [documentId] },
    config: { count, instructions: instructions || undefined },
  });
  await drainGeneration(await generateFlashcardDeck(deck.id));
  return JSON.stringify({ status: 'done', deckId: deck.id, url: `/flashcards/${deck.id}`, cards: count });
}

async function handleGeneratePodcast(args: Record<string, unknown>): Promise<string> {
  const documentId = resolveDocumentId(args);
  if (!documentId) return 'Error: no documentId provided and no document is currently open.';
  const result = await generatePodcast(documentId);
  return JSON.stringify({ status: result.status, url: `/documents/${documentId}`, note: 'Podcast audio is on the document page, Summary tab.' });
}

async function handleGenerateLesson(args: Record<string, unknown>): Promise<string> {
  const documentId = resolveDocumentId(args);
  if (!documentId) return 'Error: no documentId provided and no document is currently open.';
  const res = await fetch('/api/lessons', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documentId }),
  });
  if (!res.ok) return `Error: lesson creation failed (${res.status}).`;
  const lesson = (await res.json()) as { id: string };
  return JSON.stringify({ status: 'generating', lessonId: lesson.id, url: `/lessons/${lesson.id}`, note: 'Sections stream in over the next few minutes.' });
}

async function handleGetCurrentContext(): Promise<string> {
  // Determine which page/view the user is currently on
  let page: string;
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';

  if (pathname.startsWith('/document') || pathname.startsWith('/textbook')) {
    page = 'document';
  } else if (pathname.startsWith('/dashboard') || pathname === '/') {
    page = 'dashboard';
  } else if (pathname.startsWith('/course')) {
    page = 'course';
  } else if (pathname.startsWith('/chat')) {
    page = 'chat';
  } else {
    page = pathname || 'dashboard';
  }

  const mobileTab = useUIStore.getState().mobileActiveTab;
  const { currentDocument, currentChapter, currentChapterId, currentChapterText, viewerPage } = useDocumentStore.getState();
  const chatState = useChatStore.getState();

  const context: Record<string, unknown> = {
    page,
    mobileTab,
    chatMessageCount: chatState.messages.length,
    viewerPage,
  };

  if (currentDocument) {
    context.currentDocument = {
      id: currentDocument.id,
      name: currentDocument.name,
      type: currentDocument.type,
      tags: currentDocument.tags,
      classifyStatus: currentDocument.classifyStatus,
      chapterMarkers: currentDocument.chapterMarkers ?? [],
    };
  } else {
    context.currentDocument = null;
  }

  if (currentChapter) {
    context.currentChapter = {
      id: currentChapter.id,
      title: currentChapter.title,
      parentId: currentChapter.parentId,
    };
  } else {
    context.currentChapter = null;
  }
  context.currentChapterId = currentChapterId ?? null;

  // Surface whether the open chapter's text is already known (proactive
  // context) so the agent knows it doesn't need to call a tool to read it.
  if (currentChapterText && currentChapterText.trim().length > 0) {
    context.currentChapterTextLength = currentChapterText.length;
    context.currentChapterTextPreview =
      currentChapterText.slice(0, 500) +
      (currentChapterText.length > 500 ? `... [truncated, ${currentChapterText.length} total chars]` : '');
  } else {
    context.currentChapterTextLength = 0;
  }

  return JSON.stringify(context);
}

// ---------------------------------------------------------------------------
// Tool definitions (OpenAI function-calling format)
// ---------------------------------------------------------------------------

export const toolDefinitions: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'list_documents',
      description:
        'List all documents in the library. Returns name, id, type, tags, and classification status for each document.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_document',
      description:
        'Get details for a single document by ID. Returns metadata and a preview of the text (first 500 chars). To read full content, use list_chapters + get_chapter instead.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The document ID to retrieve.',
          },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_chapters',
      description:
        'List all chapters belonging to a parent document. Returns chapter index, title, page range, tags, and a text preview (first 200 chars each).',
      parameters: {
        type: 'object',
        properties: {
          parentId: {
            type: 'string',
            description: 'The parent document ID.',
          },
        },
        required: ['parentId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_chapter',
      description:
        'Get full details for a single chapter by ID, including its parsed text content (up to 2000 chars). Use this to read chapter content for analysis, summarization, or answering questions.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The chapter ID to retrieve.',
          },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'classify_document',
      description:
        'Trigger AI classification for a document. Returns the classification label, subject, and confidence.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The document ID to classify.',
          },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'summarize',
      description:
        'Summarize a given text. Choose the summary type based on the desired level of detail.',
      parameters: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'The text to summarize.',
          },
          type: {
            type: 'string',
            enum: ['tldr', 'keypoints'],
            description:
              'Summary style: "tldr" for a 2-3 sentence overview, "keypoints" for a bulleted list.',
          },
        },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_documents',
      description:
        'Search documents by name or tag substring. Filters the local document list client-side.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Substring to search for in document names and tags.',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_quiz',
      description:
        'Generate an AI practice quiz from a document. Uses the currently open document when no documentId is given. Returns the quiz URL.',
      parameters: {
        type: 'object',
        properties: {
          documentId: { type: 'string', description: 'Document ID. Omit to use the currently open document.' },
          count: { type: 'number', description: 'Number of questions (1-50, default 10).' },
          focus: { type: 'string', description: 'Optional focus instructions, e.g. "chapter 3 only", "exam style".' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_flashcards',
      description:
        'Generate a flashcard deck from a document. Uses the currently open document when no documentId is given. Returns the deck URL.',
      parameters: {
        type: 'object',
        properties: {
          documentId: { type: 'string', description: 'Document ID. Omit to use the currently open document.' },
          count: { type: 'number', description: 'Number of cards (1-50, default 20).' },
          instructions: { type: 'string', description: 'Optional instructions, e.g. "focus on definitions".' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_podcast',
      description:
        'Generate the two-host podcast audio overview for a document (requires its summary to exist). Uses the currently open document when no documentId is given.',
      parameters: {
        type: 'object',
        properties: {
          documentId: { type: 'string', description: 'Document ID. Omit to use the currently open document.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_lesson',
      description:
        'Create a guided, section-by-section lesson with checkpoint quizzes from a document. Uses the currently open document when no documentId is given.',
      parameters: {
        type: 'object',
        properties: {
          documentId: { type: 'string', description: 'Document ID. Omit to use the currently open document.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_current_context',
      description:
        'Get the current application context: which page the user is on, the currently selected document (if any), its chapter markers, and the currently open chapter (id, title, parentId) plus the current viewer page.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

/**
 * Route a tool-call from the LLM to the correct handler.
 * Returns a JSON-serialisable string (or plain text for AI-generated content).
 */
export async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  switch (name) {
    case 'list_documents':
      return handleListDocuments();
    case 'get_document':
      return handleGetDocument(args);
    case 'list_chapters':
      return handleListChapters(args);
    case 'get_chapter':
      return handleGetChapter(args);
    case 'classify_document':
      return handleClassifyDocument(args);
    case 'summarize':
      return handleSummarize(args);
    case 'search_documents':
      return handleSearchDocuments(args);
    case 'generate_quiz':
      return handleGenerateQuiz(args);
    case 'generate_flashcards':
      return handleGenerateFlashcards(args);
    case 'generate_podcast':
      return handleGeneratePodcast(args);
    case 'generate_lesson':
      return handleGenerateLesson(args);
    case 'get_current_context':
      return handleGetCurrentContext();
    default:
      return `Error: Unknown tool "${name}".`;
  }
}
