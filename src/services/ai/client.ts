import type { AIConfig } from '../../types/settings';
import { consumeSSE } from '../../utils/sse';
import { useSettingsStore } from '../../store/settingsStore';

export function getAIConfig(): AIConfig {
  return useSettingsStore.getState().settings.ai;
}

/**
 * Get the backend API chat URL. Routes through the Vite dev-server proxy
 * (or whatever reverse-proxy sits in front) so the browser never needs
 * to reach port 3002 directly.
 */
function getBackendUrl(): string {
  // Use the same origin the page is served from — the Vite proxy (or a
  // production reverse-proxy) will forward /api/chat to the backend.
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/chat`;
  }
  return 'http://localhost:3002/api/chat';
}

/**
 * Check if the user has a custom API key configured (meaning they want to
 * use their own provider instead of the built-in backend).
 */
function hasCustomApiKey(): boolean {
  const config = getAIConfig();
  return !!config.apiKey && config.apiKey.trim().length > 0;
}

export async function chatCompletion(messages: { role: string; content: string }[]): Promise<string> {
  const config = getAIConfig();

  // Use local backend proxy when no custom API key is set
  if (!hasCustomApiKey()) {
    const response = await fetch(getBackendUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        temperature: 0.7,
        max_tokens: 4096,
        stream: false,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Backend error: ${response.status} - ${err}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.reasoning_content || '';
  }

  // Custom API key path — use direct provider connection
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: 0.7,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API error: ${response.status} - ${err}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.reasoning_content || '';
}

export async function streamingChatCompletion(
  messages: { role: string; content: string }[],
  onChunk: (text: string) => void,
  onDone: () => void,
): Promise<void> {
  const config = getAIConfig();

  // Determine endpoint and headers based on whether we're using the backend proxy
  const useBackend = !hasCustomApiKey();
  const url = useBackend ? getBackendUrl() : `${config.baseUrl}/chat/completions`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!useBackend) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  const body: Record<string, unknown> = {
    messages,
    temperature: 0.7,
    max_tokens: 4096,
    stream: true,
  };
  if (!useBackend) {
    body.model = config.model;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error(`API error: ${response.status}`);

  // Stream the response via the shared SSE parser. The OpenAI `[DONE]`
  // sentinel is not valid JSON, so it is silently skipped; onDone() is
  // called once the stream closes naturally.
  await consumeSSE<{ choices?: Array<{ delta?: { content?: string } }> }>(response, (json) => {
    const content = json.choices?.[0]?.delta?.content;
    if (content) onChunk(content);
  });

  onDone();
}

/**
 * Raw chat completion that returns the full response object (including tool_calls).
 * Used by the agent loop to handle tool-calling responses from the LLM.
 */
export async function chatCompletionWithTools(
  messages: { role: string; content: string; tool_calls?: unknown[]; tool_call_id?: string }[],
  options?: { tools?: unknown[]; temperature?: number },
): Promise<Record<string, unknown>> {
  const config = getAIConfig();
  const useBackend = !hasCustomApiKey();
  const url = useBackend ? getBackendUrl() : `${config.baseUrl}/chat/completions`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!useBackend) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  const body: Record<string, unknown> = {
    messages,
    temperature: options?.temperature ?? 0.7,
    max_tokens: 4096,
    stream: false,
  };

  if (options?.tools && options.tools.length > 0) {
    body.tools = options.tools;
  }

  if (!useBackend) {
    body.model = config.model;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API error: ${response.status} - ${err}`);
  }

  return response.json();
}

/**
 * Check if the backend proxy is reachable (via the Vite dev-server proxy).
 */
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3002';
    const res = await fetch(`${origin}/api/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
