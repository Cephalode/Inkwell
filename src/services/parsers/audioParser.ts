import type { ParsedDocument } from '../../types/document';
import { getAIConfig } from '../ai/client';

export async function parseAudio(file: File | Blob): Promise<ParsedDocument> {
  const config = getAIConfig();
  if (!config.apiKey) {
    return { text: '[Audio transcription requires an API key. Please set your OpenAI API key in Settings.]' };
  }

  const formData = new FormData();
  formData.append('file', file instanceof File ? file : new File([file], 'audio.wav'));
  formData.append('model', 'whisper-1');

  const response = await fetch(`${config.baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${config.apiKey}` },
    body: formData,
  });

  if (!response.ok) {
    return { text: `[Audio transcription failed: ${response.statusText}]` };
  }

  const data = await response.json();
  return { text: data.text?.trim() || '' };
}
