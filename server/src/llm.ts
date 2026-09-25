import { API_KEY, UPSTREAM } from '../config.js';
import { parseJSON } from './subsectionDetector.js';

// ── Types ───────────────────────────────────────────────────────────────────

export interface GLMMessage {
  role: string;
  content: string;
}

export interface CallGLMOptions {
  /** Sampling temperature (0–2). Defaults to 0.4. */
  temperature?: number;
  /** Max tokens to generate. Defaults to 4096. */
  maxTokens?: number;
  /** Fall back to reasoning_content when content is empty — JSON callers only, never display text. */
  withReasoning?: boolean;
  /** Model name. Defaults to 'glm-5.3-flash'. */
  model?: string;
}

// ── Public API ──────────────────────────────────────────────────────────────

const DEFAULT_MODEL = 'glm-5.3-flash';

/**
 * Call the GLM chat-completions API and return the raw text response.
 *
 * Single source of truth for GLM calls across the backend — extracted from
 * chapterAnalysis.ts / videoDocuments.ts to eliminate duplication.
 *
 * @throws {Error} if the API returns a non-OK status.
 */
export async function callGLM(
  messages: GLMMessage[],
  options: CallGLMOptions = {},
): Promise<string> {
  const {
    temperature = 0.4,
    maxTokens = 4096,
    withReasoning = false,
    model = DEFAULT_MODEL,
  } = options;

  const resp = await fetch(UPSTREAM, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: maxTokens,
      stream: false,
      messages,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`GLM API error ${resp.status}: ${errText.slice(0, 200)}`);
  }

  const data = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
  };
  // GLM reasoning models can spend the whole max_tokens budget on
  // reasoning_content, leaving content empty (finish_reason "length").
  // withReasoning lets JSON callers parse that chain (JSON sits at its end);
  // display callers must never show it, so default stays off.
  const msg = data.choices?.[0]?.message;
  return msg?.content || (withReasoning ? msg?.reasoning_content : undefined) || '';
}

/**
 * Call GLM and parse the response as JSON with one retry on parse failure.
 *
 * Flow: callGLM → parseJSON → if null, retry once with "Respond with ONLY
 * valid JSON." appended to the last user message → parseJSON again.
 *
 * @returns The parsed object, or `null` if JSON could not be parsed after
 *          the retry attempt.
 */
export async function callGLMJson<T>(
  messages: GLMMessage[],
  options: CallGLMOptions = {},
): Promise<T | null> {
  const run = async (msgs: GLMMessage[]): Promise<T | null> => {
    const raw = await callGLM(msgs, { ...options, withReasoning: true });
    return parseJSON<T>(raw);
  };
  // Retry once on a thrown transport failure too (timeouts, socket drops) —
  // an activity-start 502 is worse than a slow start.
  try {
    const first = await run(messages);
    if (first !== null) return first;
  } catch (err) {
    console.warn('callGLMJson first attempt threw, retrying once:', err instanceof Error ? err.message : err);
  }
  // Retry: nudge the model to respond with clean JSON.
  const retryMessages: GLMMessage[] = messages.map((m, i) => {
    if (i === messages.length - 1 && m.role === 'user') {
      return { ...m, content: `${m.content}\n\nRespond with ONLY valid JSON.` };
    }
    return m;
  });
  return run(retryMessages);
}
