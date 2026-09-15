import type { ComponentPropsWithoutRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

// ── Element → styled JSX mapping (Broadsheet tokens) ────────────────────────
// Intentionally avoids @tailwindcss/typography; base text color lives on the
// wrapper <div> so callers can override size/color via the `className` prop and
// have it cascade into paragraphs/lists. Headings pick up the serif face from
// the global h1–h4 rules.
const components: ComponentPropsWithoutRef<typeof ReactMarkdown>['components'] = {
  h1: ({ children }) => <h1 className="text-lg mb-2 mt-3 leading-tight">{children}</h1>,
  h2: ({ children }) => <h2 className="text-base mb-2 mt-3 leading-tight">{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm mb-1.5 mt-2 leading-tight">{children}</h3>,
  h4: ({ children }) => <h4 className="text-sm mb-1 mt-2 leading-tight">{children}</h4>,
  h5: ({ children }) => <h5 className="text-xs font-semibold mb-1 mt-1.5">{children}</h5>,
  h6: ({ children }) => <h6 className="text-xs font-semibold opacity-60 mb-1 mt-1.5">{children}</h6>,

  p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="list-disc list-outside ml-5 mb-2 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal list-outside ml-5 mb-2 space-y-1">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed pl-1">{children}</li>,

  blockquote: ({ children }) => (
    <blockquote
      className="pl-3 my-2 italic opacity-80"
      style={{ borderLeft: '2px solid var(--color-accent)' }}
    >
      {children}
    </blockquote>
  ),

  // react-markdown wraps fenced blocks in <pre><code class="language-x">;
  // inline code has no language- class. We style the box on <code> and let
  // <pre> be a transparent margin wrapper (mirrors the GlobalChat approach).
  code: ({ className, children }) => {
    const isBlock = /language-(\w+)/.test(className ?? '');
    if (isBlock) {
      return (
        <code
          className={`${className ?? ''} block w-full p-3 my-2 text-xs overflow-x-auto font-mono`}
          style={{
            background: 'var(--color-neutral-100)',
            border: '1px solid var(--color-divider)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          {children}
        </code>
      );
    }
    return (
      <code
        className="px-1.5 py-0.5 text-xs font-mono"
        style={{ background: 'var(--color-neutral-200)', borderRadius: 'var(--radius-sm)' }}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => <pre className="my-2">{children}</pre>,

  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline"
      style={{ color: 'var(--color-accent-600)' }}
    >
      {children}
    </a>
  ),

  table: ({ children }) => (
    <div className="overflow-x-auto my-2">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead style={{ background: 'color-mix(in srgb, var(--color-text) 6%, transparent)' }}>{children}</thead>
  ),
  th: ({ children }) => (
    <th
      className="px-2 py-1 font-semibold text-left"
      style={{ border: '1px solid var(--color-neutral-300)' }}
    >
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-2 py-1" style={{ border: '1px solid var(--color-neutral-300)' }}>{children}</td>
  ),

  hr: () => <hr className="my-3" style={{ borderColor: 'var(--color-divider)' }} />,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
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
 * Renders GitHub-flavored markdown styled with the Broadsheet tokens.
 */
export default function Markdown({ content, className, compact = false }: MarkdownProps) {
  const compactCls = compact ? '[&_p]:mb-0 [&_ul]:mb-0 [&_ol]:mb-0 [&_blockquote]:my-0' : '';
  return (
    <div className={`text-sm leading-relaxed max-w-none ${compactCls} ${className ?? ''}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
