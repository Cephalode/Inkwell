import Tesseract from 'tesseract.js';
import type { ParsedDocument } from '../../types/document';

export async function parseImage(file: File | Blob): Promise<ParsedDocument> {
  const result = await Tesseract.recognize(file, 'eng', {
    logger: () => {},
  });
  return { text: result.data.text.trim() };
}
