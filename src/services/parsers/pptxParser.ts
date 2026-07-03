import { parse as parsePPTX } from 'pptxtojson';
import type { ParsedDocument } from '../../types/document';

/** Minimal shape of a pptxtojson text element. */
interface PptxTextElement {
  type?: string;
  content?: string;
  text?: string;
}

/** Minimal shape of a pptxtojson slide. */
interface PptxSlide {
  elements?: PptxTextElement[];
}

/** Minimal shape of the pptxtojson parse result. */
interface PptxParseResult {
  slides?: PptxSlide[];
}

export async function parsePPTXFile(file: File | Blob): Promise<ParsedDocument> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await parsePPTX(arrayBuffer) as PptxParseResult;
  const text = result?.slides
    ?.map((slide) =>
      slide?.elements
        ?.filter((el) => el?.type === 'text')
        .map((el) => el?.content || el?.text || '')
        .join('\n') || ''
    )
    .filter(Boolean)
    .join('\n\n') || '';
  return { text: text.trim() };
}
