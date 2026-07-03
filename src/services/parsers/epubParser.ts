import ePub from 'epubjs';
import type { ParsedDocument, Chapter } from '../../types/document';

/** Minimal shape of an epubjs spine item we consume. */
interface EpubSpineItem {
  href?: string;
  url?: string;
  id?: string;
}

/** Minimal shape of the epubjs spine object we consume. */
interface EpubSpine {
  items?: EpubSpineItem[];
}

/** Iterable that may be either the spine object or its items array. */
type EpubSpineLike = EpubSpine | EpubSpineItem[];

export async function parseEPUB(file: File | Blob): Promise<ParsedDocument> {
  const arrayBuffer = await file.arrayBuffer();
  const book = ePub(arrayBuffer);
  await book.ready;

  const chapters: Chapter[] = [];
  const texts: string[] = [];
  try {
    const spine: EpubSpineLike = await book.loaded.spine as EpubSpineLike;
    const items: EpubSpineItem[] = (Array.isArray(spine) ? spine : spine.items) ?? [];
    let pageNum = 1;
    for (const item of items) {
      try {
        const href = item.href || item.url || '';
        if (!href) continue;
        const contents: unknown = await book.load(href);
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
