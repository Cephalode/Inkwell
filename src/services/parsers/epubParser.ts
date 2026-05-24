import ePub from 'epubjs';
import type { ParsedDocument, Chapter } from '../../types/document';

export async function parseEPUB(file: File | Blob): Promise<ParsedDocument> {
  const arrayBuffer = await file.arrayBuffer();
  const book = ePub(arrayBuffer);
  await book.ready;

  const chapters: Chapter[] = [];
  const texts: string[] = [];
  try {
    const spine: any = await book.loaded.spine;
    const items: any[] = spine?.items || spine || [];
    let pageNum = 1;
    for (const item of items) {
      try {
        const href = item.href || item.url || '';
        if (!href) continue;
        const contents: any = await book.load(href);
        const div = document.createElement('div');
        div.innerHTML = String(contents);
        const text = div.textContent || '';
        if (text.trim()) {
          texts.push(text.trim());
          chapters.push({ title: (item.id || `Chapter ${pageNum}`).replace(/-/g, ' '), page: pageNum });
          pageNum++;
        }
      } catch { /* skip */ }
    }
  } catch { /* epub parsing failed */ }

  return { text: texts.join('\n\n'), chapters };
}
