// Quick test: does pdfjs-dist work in Node ESM with text + transform extraction?
import { readFileSync } from 'fs';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');

const filePath = 'test-pdfs/01-think-python.pdf';
const data = new Uint8Array(readFileSync(filePath));
const pdf = await getDocument({ data }).promise;
console.log('pages:', pdf.numPages);

const page = await pdf.getPage(1);
const content = await page.getTextContent();
const item = content.items.find(i => 'transform' in i && i.str.trim());
console.log('sample item str:', JSON.stringify(item.str));
console.log('has transform:', 'transform' in item);
console.log('transform:', item.transform);
const fontSize = Math.sqrt(item.transform[2] ** 2 + item.transform[3] ** 2);
console.log('computed fontSize:', fontSize);
console.log('x:', item.transform[4], 'y:', item.transform[5]);
console.log('SUCCESS');
