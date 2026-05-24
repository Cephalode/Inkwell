import { saveAs } from 'file-saver';

export function exportToMarkdown(title: string, content: string): void {
  const md = `# ${title}\n\n${content}`;
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  saveAs(blob, `${title.replace(/\s+/g, '_')}.md`);
}
