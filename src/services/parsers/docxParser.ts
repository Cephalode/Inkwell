import mammoth from 'mammoth';
import type { ParsedDocument } from '../../types/document';

export async function parseDOCX(file: File | Blob): Promise<ParsedDocument> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return { text: result.value.trim() };
}
