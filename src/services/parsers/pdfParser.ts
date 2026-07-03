import * as pdfjsLib from 'pdfjs-dist';
import type { ParsedDocument, PageContent } from '../../types/document';

import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export async function parsePDF(file: File | Blob): Promise<ParsedDocument> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: PageContent[] = [];
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((item: any) => item.str).join(' ');
    pages.push({ pageNumber: i, text });
    fullText += text + '\n';
  }

  return { text: fullText.trim(), pages };
}

export async function extractPageRange(
  file: File | Blob | ArrayBuffer,
  startPage: number,
  endPage: number
): Promise<string> {
  const data = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const texts: string[] = [];

  for (let i = Math.max(1, startPage); i <= Math.min(endPage, pdf.numPages); i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    texts.push(content.items.map((item: any) => item.str).join(' '));
  }

  return texts.join('\n\n');
}

export async function getPDFPageCount(file: File | Blob): Promise<number> {
  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  return pdf.numPages;
}

export async function renderPDFPage(
  file: File | Blob | ArrayBuffer,
  pageNumber: number,
  scale: number = 0.3
): Promise<string> {
  const data = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d')!;
  await page.render({ canvas: canvas as any, canvasContext: ctx, viewport } as any).promise;
  return canvas.toDataURL('image/jpeg', 0.7);
}

/** Render a PDF page onto an existing canvas. Returns a cancel function. */
export async function renderPDFPageToCanvas(
  canvas: HTMLCanvasElement,
  pdf: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  scale: number = 1.0,
): Promise<() => void> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const task = page.render({ canvas: canvas as any, canvasContext: ctx, viewport } as any);
  await task.promise;
  return () => task.cancel();
}
