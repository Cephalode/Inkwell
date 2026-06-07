import type { AIConfig } from '../../types/settings';
import { useSettingsStore } from '../../store/settingsStore';

export function getAIConfig(): AIConfig {
  return useSettingsStore.getState().settings.ai;
}

/**
 * Get the local backend proxy URL using the current hostname (works for
 * localhost, Tailscale IPs, LAN IPs, etc.)
 */
function getBackendUrl(): string {
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  return `http://${hostname}:3002/api/chat`;
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

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') { onDone(); return; }
      try {
        const json = JSON.parse(data);
        const content = json.choices?.[0]?.delta?.content;
        if (content) onChunk(content);
      } catch { /* skip */ }
    }
  }
  onDone();
}

/**
 * Check if the backend proxy is reachable.
 */
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    const res = await fetch(`http://${hostname}:3002/api/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
