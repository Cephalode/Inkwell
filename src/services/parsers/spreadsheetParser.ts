import * as XLSX from 'xlsx';
import type { ParsedDocument } from '../../types/document';

export async function parseSpreadsheet(file: File | Blob): Promise<ParsedDocument> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const texts: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    texts.push(`=== Sheet: ${sheetName} ===\n${csv}`);
  }

  return { text: texts.join('\n\n').trim() };
}
