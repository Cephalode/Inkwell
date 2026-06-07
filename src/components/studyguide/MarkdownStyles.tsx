import type { Components } from 'react-markdown';

export const markdownComponents: Components = {
  h1: ({ children, ...props }) => (
    <h1 className="text-2xl font-bold text-white mt-8 mb-4 first:mt-0" {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => {
    const text = extractText(children);
    const id = slugify(text);
    return (
      <h2 id={id} className="text-xl font-bold text-cyan-300 mt-8 mb-3 border-b border-slate-700/60 pb-2" {...props}>
        {children}
      </h2>
    );
  },
  h3: ({ children, ...props }) => {
    const text = extractText(children);
    const id = slugify(text);
    return (
      <h3 id={id} className="text-lg font-semibold text-cyan-400 mt-6 mb-2" {...props}>
        {children}
      </h3>
    );
  },
  h4: ({ children, ...props }) => {
    const text = extractText(children);
    const id = slugify(text);
    return (
      <h4 id={id} className="text-base font-semibold text-teal-300 mt-4 mb-2" {...props}>
        {children}
      </h4>
    );
  },
  p: ({ children, ...props }) => (
    <p className="text-slate-200 leading-7 mb-4" {...props}>
      {children}
    </p>
  ),
  strong: ({ children, ...props }) => (
    <strong className="font-semibold text-white" {...props}>{children}</strong>
  ),
  em: ({ children, ...props }) => (
    <em className="italic text-teal-300/90" {...props}>{children}</em>
  ),
  code: ({ className, children, ...props }) => {
    const isInline = !className;
    if (isInline) {
      return (
        <code className="bg-slate-700/70 text-cyan-300 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className={`${className ?? ''} text-sm`} {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children, ...props }) => (
    <pre className="bg-slate-900/80 border border-slate-700/50 rounded-lg p-4 mb-4 overflow-x-auto text-sm" {...props}>
      {children}
    </pre>
  ),
  ul: ({ children, ...props }) => (
    <ul className="list-disc list-outside ml-6 mb-4 space-y-1 text-slate-200" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="list-decimal list-outside ml-6 mb-4 space-y-1 text-slate-200" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li className="leading-7" {...props}>{children}</li>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote className="border-l-4 border-cyan-500/60 pl-4 my-4 text-slate-300 italic bg-slate-800/30 py-2 rounded-r" {...props}>
      {children}
    </blockquote>
  ),
  table: ({ children, ...props }) => (
    <div className="overflow-x-auto mb-4">
      <table className="w-full border-collapse border border-slate-600/50 text-sm" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }) => (
    <thead className="bg-slate-700/50" {...props}>{children}</thead>
  ),
  tbody: ({ children, ...props }) => (
    <tbody className="divide-y divide-slate-700/50" {...props}>{children}</tbody>
  ),
  th: ({ children, ...props }) => (
    <th className="px-4 py-2 text-left text-cyan-300 font-semibold border border-slate-600/50" {...props}>
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td className="px-4 py-2 text-slate-200 border border-slate-600/50" {...props}>
      {children}
    </td>
  ),
  hr: ({ ...props }) => (
    <hr className="border-slate-700/50 my-6" {...props} />
  ),
  a: ({ children, ...props }) => (
    <a className="text-cyan-400 hover:text-cyan-300 underline" target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  ),
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function extractText(children: unknown): string {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(extractText).join('');
  if (children && typeof children === 'object' && 'props' in children) {
    return extractText((children as { props: { children: unknown } }).props.children);
  }
  return '';
}

export { slugify, extractText };
