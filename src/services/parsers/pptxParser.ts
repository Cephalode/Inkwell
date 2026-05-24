import { parse as parsePPTX } from 'pptxtojson';
import type { ParsedDocument } from '../../types/document';

export async function parsePPTXFile(file: File | Blob): Promise<ParsedDocument> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await parsePPTX(arrayBuffer);
  const text = (result as any)?.slides
    ?.map((slide: any) =>
      slide?.elements
        ?.filter((el: any) => el?.type === 'text')
        .map((el: any) => el?.content || el?.text || '')
        .join('\n') || ''
    )
    .filter(Boolean)
    .join('\n\n') || '';
  return { text: text.trim() };
}
