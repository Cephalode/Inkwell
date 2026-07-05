import type { ComponentPropsWithoutRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

// ── Element → styled JSX mapping (dark cyan/teal theme) ─────────────────────
// Intentionally avoids @tailwindcss/typography; base text color lives on the
// wrapper <div> so callers can override size/color via the `className` prop and
// have it cascade into paragraphs/lists.
const components: ComponentPropsWithoutRef<typeof ReactMarkdown>['components'] = {
  h1: ({ children }) => <h1 className="text-lg font-bold text-cyan-300 mb-2 mt-3 leading-tight">{children}</h1>,
  h2: ({ children }) => <h2 className="text-base font-bold text-cyan-300 mb-2 mt-3 leading-tight">{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-semibold text-teal-300 mb-1.5 mt-2 leading-tight">{children}</h3>,
  h4: ({ children }) => <h4 className="text-sm font-semibold text-teal-300 mb-1 mt-2 leading-tight">{children}</h4>,
  h5: ({ children }) => <h5 className="text-xs font-semibold text-teal-300 mb-1 mt-1.5">{children}</h5>,
  h6: ({ children }) => <h6 className="text-xs font-semibold text-slate-400 mb-1 mt-1.5">{children}</h6>,

  p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="list-disc list-outside ml-5 mb-2 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal list-outside ml-5 mb-2 space-y-1">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed pl-1">{children}</li>,

  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-cyan-500/60 pl-3 my-2 italic text-slate-300">{children}</blockquote>
  ),

  // react-markdown wraps fenced blocks in <pre><code class="language-x">;
  // inline code has no language- class. We style the box on <code> and let
  // <pre> be a transparent margin wrapper (mirrors the GlobalChat approach).
  code: ({ className, children }) => {
    const isBlock = /language-(\w+)/.test(className ?? '');
    if (isBlock) {
      return (
        <code
          className={`${className ?? ''} block w-full bg-slate-950/70 border border-slate-700/50 rounded-lg p-3 my-2 text-xs overflow-x-auto font-mono text-teal-200`}
        >
          {children}
        </code>
      );
    }
    return <code className="bg-slate-700/60 px-1.5 py-0.5 rounded text-xs font-mono text-cyan-200">{children}</code>;
  },
  pre: ({ children }) => <pre className="my-2">{children}</pre>,

  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline hover:text-cyan-300">
      {children}
    </a>
  ),

  table: ({ children }) => (
    <div className="overflow-x-auto my-2">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-slate-700/40">{children}</thead>,
  th: ({ children }) => (
    <th className="border border-slate-600 px-2 py-1 font-semibold text-cyan-200 text-left">{children}</th>
  ),
  td: ({ children }) => <td className="border border-slate-600 px-2 py-1">{children}</td>,

  hr: () => <hr className="border-slate-600/60 my-3" />,
  strong: ({ children }) => <strong className="font-bold text-slate-100">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
};

interface MarkdownProps {
  content: string;
  className?: string;
  /**
   * Flatten vertical margins on inner blocks. Handy when rendering short
   * fragments (single key point / formula / definition) inside list items so
   * trailing paragraph margins don't throw off spacing.
   */
  compact?: boolean;
}

/**
 * Thin, theme-aware wrapper around react-markdown + remark-gfm.
 * Renders GitHub-flavored markdown with Tailwind dark cyan/teal styling.
 */
export default function Markdown({ content, className, compact = false }: MarkdownProps) {
  const compactCls = compact ? '[&_p]:mb-0 [&_ul]:mb-0 [&_ol]:mb-0 [&_blockquote]:my-0' : '';
  return (
    <div className={`text-sm leading-relaxed text-slate-300 max-w-none ${compactCls} ${className ?? ''}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
