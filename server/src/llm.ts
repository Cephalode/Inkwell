import { API_KEY, UPSTREAM } from '../config.js';
import { parseJSON } from './subsectionDetector.js';

// ── Types ───────────────────────────────────────────────────────────────────

export interface GLMMessage {
  role: string;
  /** A string, or multimodal parts ({type:'text'} / {type:'image_url'}) for vision calls. */
  content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
}

export interface CallGLMOptions {
  /** Sampling temperature (0–2). Defaults to 0.4. */
  temperature?: number;
  /** Max tokens to generate. Defaults to 4096. */
  maxTokens?: number;
  /** Fall back to reasoning_content when content is empty — JSON callers only, never display text. */
  withReasoning?: boolean;
  /** Ask GLM to skip chain-of-thought entirely — short structured outputs
   *  (e.g. SVG diagram JSON) where verbose coordinate-planning reasoning
   *  burned the token budget before any JSON was emitted. */
  thinkingDisabled?: boolean;
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
    thinkingDisabled = false,
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
      // Omitted when unset — the API rejects nothing either way, but the
      // default (thinking on) is what the reasoning-dependent callers expect.
      ...(thinkingDisabled ? { thinking: { type: 'disabled' } } : {}),
    }),
    // ponytail: flat 5-min cap — a stalled upstream must not hang a whole
    // generation past the pipeline's 10-min reaper window. callGLMJson's
    // retry covers transient stalls; 5 min fits even 8k-token syntheses.
    signal: AbortSignal.timeout(300_000),
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
    const parsed = parseJSON<T>(raw);
    if (parsed === null) {
      // Unparseable output must never be silent — head/tail shows truncation
      // (cut mid-JSON, usually max_tokens) vs prose (no JSON at all).
      console.warn(
        `callGLMJson: unparseable response (${raw.length} chars) head=${JSON.stringify(raw.slice(0, 150))} tail=${JSON.stringify(raw.slice(-150))}`,
      );
    }
    return parsed;
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
      if (typeof m.content === 'string') return { ...m, content: `${m.content}\n\nRespond with ONLY valid JSON.` };
      // Multimodal content: append the nudge as another text part (string concat would garble it).
      return { ...m, content: [...m.content, { type: 'text' as const, text: 'Respond with ONLY valid JSON.' }] };
    }
    return m;
  });
  return run(retryMessages);
}
