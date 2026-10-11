// Video files have no client-side text layer — metadata only.
// Transcription/summary for uploaded video is a future feature (the server
// keeps the blob; classification is skipped for empty parsed_text).
import type { ParsedDocument } from '../../types/document';

export async function parseVideo(file: File): Promise<ParsedDocument> {
  return {
    text: `[Video file: ${file.name}${file.type ? `, ${file.type}` : ''}]`,
  };
}
