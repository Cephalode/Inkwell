import { jsPDF } from 'jspdf';

export function exportNotesToPDF(title: string, content: string): void {
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.text(title, 20, 20);
  doc.setFontSize(11);

  const lines = doc.splitTextToSize(content, 170);
  let y = 35;
  for (const line of lines) {
    if (y > 280) {
      doc.addPage();
      y = 20;
    }
    doc.text(line, 20, y);
    y += 6;
  }

  doc.save(`${title.replace(/\s+/g, '_')}.pdf`);
}
