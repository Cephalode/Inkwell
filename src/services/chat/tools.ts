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
  const chapter = await getChapter(id);
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
  const type = (args.type as 'tldr' | 'keypoints' | 'detailed') || 'keypoints';

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
  const { currentDocument } = useDocumentStore.getState();
  const chatState = useChatStore.getState();

  const context: Record<string, unknown> = {
    page,
    mobileTab,
    chatMessageCount: chatState.messages.length,
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
            enum: ['tldr', 'keypoints', 'detailed'],
            description:
              'Summary style: "tldr" for a 2-3 sentence overview, "keypoints" for a bulleted list, "detailed" for a comprehensive summary.',
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
      name: 'get_current_context',
      description:
        'Get the current application context: which page the user is on, the currently selected document (if any), and its chapter markers.',
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
    case 'get_current_context':
      return handleGetCurrentContext();
    default:
      return `Error: Unknown tool "${name}".`;
  }
}
