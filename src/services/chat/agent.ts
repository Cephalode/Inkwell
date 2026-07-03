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

  const toolDescriptions = toolDefinitions
    .map((t) => `- ${t.function.name}: ${t.function.description}`)
    .join('\n');

  return `You are Inkwell AI, an expert study assistant integrated into the Inkwell application. You help students understand their course materials, create study aids, and answer questions based on the provided content. Always cite specific parts of the source material when answering.

${docInfo}. The student is currently on page "${context.currentPage}".

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
