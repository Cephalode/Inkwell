import { TextChunk, chunkText, findRelevantChunks } from './chunker';
import { chatCompletion } from '../ai/client';
import { CHAT_SYSTEM_PROMPT } from '../ai/prompts';
import { ChatMessage, Citation } from '../../types/chat';

export async function buildContextFromChunks(query: string, text: string): Promise<string> {
  const chunks = chunkText(text);
  const relevant = findRelevantChunks(query, chunks, 3);
  return relevant.map((c) => c.text).join('\n\n---\n\n');
}

export async function ragChat(
  query: string,
  documentText: string,
  history: ChatMessage[] = [],
): Promise<{ answer: string; citations: Citation[] }> {
  const context = await buildContextFromChunks(query, documentText);
  const messages = [
    { role: 'system', content: CHAT_SYSTEM_PROMPT(context) },
    ...history.slice(-10).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: query },
  ];

  const answer = await chatCompletion(messages);
  return { answer, citations: [] };
}
