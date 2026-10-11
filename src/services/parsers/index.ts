import type { ParsedDocument } from '../../types/document';
import { parsePDF } from './pdfParser';
import { parseDOCX } from './docxParser';
import { parsePPTXFile } from './pptxParser';
import { parseSpreadsheet } from './spreadsheetParser';
import { parseImage } from './imageParser';
import { parseAudio } from './audioParser';
import { parseVideo } from './videoParser';
import { parseEPUB } from './epubParser';

export { extractPageRange, getPDFPageCount, renderPDFPage, renderPDFPageToCanvas } from './pdfParser';
export { parseYouTube } from './youtubeParser';

export async function parseFile(file: File): Promise<ParsedDocument> {
  const mime = file.type;
  const ext = '.' + file.name.split('.').pop()?.toLowerCase();

  if (mime === 'application/pdf' || ext === '.pdf') return parsePDF(file);
  if (mime.includes('wordprocessingml') || ext === '.docx') return parseDOCX(file);
  if (mime.includes('presentationml') || ext === '.pptx') return parsePPTXFile(file);
  if (mime.includes('spreadsheetml') || mime === 'text/csv' || ext === '.xlsx' || ext === '.csv') return parseSpreadsheet(file);
  if (mime === 'application/epub+zip' || ext === '.epub') return parseEPUB(file);
  if (mime.startsWith('image/')) return parseImage(file);
  if (mime.startsWith('audio/') || ext === '.m4a' || ext === '.aac') return parseAudio(file);
  if (mime.startsWith('video/') || ext === '.mp4' || ext === '.mov' || ext === '.m4v' || ext === '.webm') return parseVideo(file);
  if (mime.startsWith('text/') || ext === '.txt' || ext === '.md') return { text: await file.text() };
  try { return { text: await file.text() }; } catch { return { text: '[Unsupported file type]' }; }
}
