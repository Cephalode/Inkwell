import { useMemo } from 'react';
import { slugify, extractText } from './MarkdownStyles';

interface Heading {
  level: number;
  text: string;
  id: string;
}

interface TableOfContentsProps {
  markdown: string;
}

function parseHeadings(markdown: string): Heading[] {
  const headingRegex = /^(#{2,4})\s+(.+)$/gm;
  const headings: Heading[] = [];
  let match;
  while ((match = headingRegex.exec(markdown)) !== null) {
    const level = match[1].length;
    const text = match[2].trim();
    const id = slugify(text);
    headings.push({ level, text: extractText(text), id });
  }
  return headings;
}

export default function TableOfContents({ markdown }: TableOfContentsProps) {
  const headings = useMemo(() => parseHeadings(markdown), [markdown]);

  if (headings.length === 0) return null;

  const handleClick = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="space-y-1">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">On this page</h4>
      <nav className="space-y-0.5">
        {headings.map((h) => (
          <button
            key={h.id}
            onClick={() => handleClick(h.id)}
            className={`block w-full text-left text-sm text-slate-400 hover:text-cyan-300 transition-colors truncate rounded px-1 py-0.5 ${
              h.level === 3 ? 'pl-4' : h.level === 4 ? 'pl-8' : ''
            }`}
          >
            {h.text}
          </button>
        ))}
      </nav>
    </div>
  );
}
