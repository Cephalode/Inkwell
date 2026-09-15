import type { ChatMessage } from '../../types/chat';
import { chatCompletionWithTools } from '../ai/client';
import { toolDefinitions, executeToolCall } from './tools';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single tool call returned by the LLM in OpenAI-compatible format. */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON-encoded
  };
}

/** Result of a single completed agent turn. */
export interface AgentTurnResult {
  content: string;
  toolCalls: { name: string; args: Record<string, unknown>; result: string }[];
}

/** Optional callbacks for streaming / UI feedback during an agent turn. */
export interface AgentCallbacks {
  /** Called when the agent starts processing a tool call. */
  onToolStart?: (name: string, args: Record<string, unknown>) => void;
  /** Called when a tool call completes with its result string. */
  onToolEnd?: (name: string, result: string) => void;
  /** Called when the agent is "thinking" (about to call LLM or execute tools). */
  onThinking?: () => void;
}

/** Context passed to `buildSystemMessage`. */
export interface SystemMessageContext {
  currentPage: string;
  currentDocumentName?: string;
  currentDocumentId?: string;
  /** Chapter the student currently has open in the textbook viewer. */
  currentChapter?: { id: string; title: string; parentId: string } | null;
  currentChapterId?: string | null;
  /** Parsed text of the currently open chapter, when available. Included
   *  directly in the system prompt so the agent can read what's on screen
   *  without a tool call (Cursor-style proactive context). */
  currentChapterText?: string | null;
  /** Current page within the open chapter (1-indexed). */
  viewerPage?: number;
  /** Files explicitly @-referenced by the student in their message. */
  attachedFileRefs?: { id: string; name: string; type: string }[];
}

// ---------------------------------------------------------------------------
// System message builder
// ---------------------------------------------------------------------------

/**
 * Builds the system prompt for the agent.
 *
 * Tells the LLM it is Inkwell AI, describes the current page/document context,
 * and lists the tools available to it.
 */
export function buildSystemMessage(context: SystemMessageContext): string {
  const docInfo = context.currentDocumentName
    ? `The student is currently viewing "${context.currentDocumentName}"${
        context.currentDocumentId ? ` (id: ${context.currentDocumentId})` : ''
      }`
    : 'No specific document is currently open.';

  // Chapter context — the exact chapter the student has open in the viewer.
  let chapterInfo = '';
  if (context.currentChapter) {
    const parentLabel = context.currentDocumentName ?? context.currentChapter.parentId;
    chapterInfo = `\nThe user currently has open: Chapter "${context.currentChapter.title}" (ID: ${context.currentChapter.id}) from document "${parentLabel}".`;
    if (typeof context.viewerPage === 'number' && context.viewerPage > 0) {
      chapterInfo += `\nCurrent page in chapter: ${context.viewerPage}.`;
    }
  }

  // Proactive chapter content — include the parsed text of the open chapter so
  // the agent can answer questions about what's on screen WITHOUT a tool call.
  // (Note: for converted textbooks the chapter id is a document UUID, so the
  //  get_chapter tool would 404 — providing the text here sidesteps that.)
  let chapterContent = '';
  const chapterText = context.currentChapterText;
  if (chapterText && chapterText.trim().length > 0) {
    const MAX_EXCERPT = 4000;
    const excerpt = chapterText.length > MAX_EXCERPT
      ? chapterText.slice(0, MAX_EXCERPT) + `\n... [truncated; ${chapterText.length} total chars available]`
      : chapterText;
    const totalChars = chapterText.length;
    chapterContent = `\n--- BEGIN CONTENT OF THE OPEN CHAPTER ("${context.currentChapter?.title ?? ''}", ${totalChars} chars total) ---\n${excerpt}\n--- END CHAPTER CONTENT ---\nYou already have this chapter's content above — answer questions about it directly. For content beyond this excerpt, use the get_chapter / get_document tools (the chapter ID ${context.currentChapter?.id ?? ''} resolves via the documents endpoint).`;
  }

  // Explicitly @-referenced files — the agent should prefer reading these.
  let attachedInfo = '';
  if (context.attachedFileRefs && context.attachedFileRefs.length > 0) {
    const list = context.attachedFileRefs
      .map((r) => `- "${r.name}" (id: ${r.id}, type: ${r.type})`)
      .join('\n');
    attachedInfo = `\nThe user explicitly referenced the following files. Use get_document / get_chapter / list_chapters to read their content before answering:\n${list}`;
  }

  const toolDescriptions = toolDefinitions
    .map((t) => `- ${t.function.name}: ${t.function.description}`)
    .join('\n');

  return `You are Inkwell AI, an expert study assistant integrated into the Inkwell application. You help students understand their course materials, create study aids, and answer questions based on the provided content. Always cite specific parts of the source material when answering.

${docInfo}.${chapterInfo}${chapterContent}${attachedInfo}
The student is currently on page "${context.currentPage}".

You have access to the following tools. Use them when the student asks you to perform actions that are better handled programmatically (e.g., searching documents, summarizing pages). Only call a tool when it directly helps answer the user's request.

Available tools:
${toolDescriptions}

Guidelines:
- Answer based ONLY on the materials and context available to you.
- If the answer is not in the materials, say so honestly.
- Reference specific sections or page numbers when citing information.
- When using tools, call them one at a time if they are independent, or batch independent calls together.
- After executing a tool, interpret the result and present it clearly to the student.`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Maximum number of LLM round-trips (tool-call iterations) per agent turn. */
const MAX_ITERATIONS = 10;

/** Shape of a single choice in the OpenAI-compatible response. */
interface Choice {
  message: {
    role: string;
    content: string | null;
    tool_calls?: ToolCall[];
  };
}

/** Safely extract tool calls from the raw response. */
function extractToolCalls(data: Record<string, unknown>): ToolCall[] | null {
  const choices = data.choices as Choice[] | undefined;
  const message = choices?.[0]?.message;
  return message?.tool_calls?.length ? message.tool_calls : null;
}

/** Safely extract text content from the raw response. */
function extractContent(data: Record<string, unknown>): string {
  const choices = data.choices as Choice[] | undefined;
  return choices?.[0]?.message?.content ?? '';
}

/**
 * Parse a tool-call's arguments JSON string into a typed object.
 * Returns an empty object on parse failure.
 */
function parseToolArgs(argsStr: string): Record<string, unknown> {
  try {
    return JSON.parse(argsStr) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Agent loop
// ---------------------------------------------------------------------------

/**
 * Run one full agentic turn.
 *
 * 1. Builds a system message from the provided context.
 * 2. Converts conversation history + new user message into the wire format.
 * 3. Loops: send messages + tool definitions to LLM → if tool_calls are
 *    returned, execute each one, append results, and call LLM again.
 * 4. Stops when the LLM returns a plain text response or the iteration cap
 *    is reached.
 *
 * @param userMessage   The new message from the user.
 * @param history       Prior conversation messages.
 * @param context       Page / document context for the system prompt.
 * @param callbacks     Optional streaming / UI callbacks.
 */
export async function runAgentTurn(
  userMessage: string,
  history: ChatMessage[],
  context: SystemMessageContext,
  callbacks?: AgentCallbacks,
): Promise<AgentTurnResult> {
  // ---- Build the initial messages array ----
  const messages: Array<{
    role: string;
    content: string;
    tool_calls?: ToolCall[];
    tool_call_id?: string;
  }> = [
    { role: 'system', content: buildSystemMessage(context) },
    // Convert existing history to the wire format (last 20 messages for context window)
    ...history.slice(-20).map((m) => ({
      role: m.role,
      content: m.content,
    })),
    { role: 'user', content: userMessage },
  ];

  const toolCallsLog: AgentTurnResult['toolCalls'] = [];

  // ---- Main agentic loop ----
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    callbacks?.onThinking?.();

    const data = await chatCompletionWithTools(messages, {
      tools: toolDefinitions,
      temperature: 0.7,
    });

    const toolCalls = extractToolCalls(data);

    // No tool calls → we have our final text answer
    if (!toolCalls) {
      return {
        content: extractContent(data),
        toolCalls: toolCallsLog,
      };
    }

    // Append the assistant's tool-call message to conversation
    messages.push({
      role: 'assistant',
      content: extractContent(data),
      tool_calls: toolCalls,
    });

    // Execute each tool call and collect results
    for (const tc of toolCalls) {
      const args = parseToolArgs(tc.function.arguments);
      callbacks?.onToolStart?.(tc.function.name, args);

      let result: string;
      try {
        result = await executeToolCall(tc.function.name, args);
      } catch (err) {
        result = `Error executing tool ${tc.function.name}: ${err instanceof Error ? err.message : String(err)}`;
      }

      callbacks?.onToolEnd?.(tc.function.name, result);

      toolCallsLog.push({ name: tc.function.name, args, result });

      // Append the tool result message (required by OpenAI tool-calling protocol)
      messages.push({
        role: 'tool',
        content: result,
        tool_call_id: tc.id,
      });
    }
  }

  // Exhausted iteration cap — return whatever the last response was
  return {
    content: '',
    toolCalls: toolCallsLog,
  };
}
