import { useRef, useEffect } from 'react';
import { HiDocumentText, HiBookOpen } from 'react-icons/hi';

/** An item that can be @-referenced in the chat input. */
export interface MentionableItem {
  id: string;
  name: string;
  type: 'document' | 'chapter';
  parentId?: string;
}

interface MentionPopoverProps {
  /** Already-filtered items to display. */
  items: MentionableItem[];
  /** Index of the keyboard-highlighted item. */
  activeIndex: number;
  /** Called when the user picks an item (click or Enter). */
  onSelect: (item: MentionableItem) => void;
  /** Called when the popover should close (outside click / escape handled by parent). */
  onClose: () => void;
}

/**
 * Cursor-style @ mention autocomplete popover.
 *
 * Rendered absolutely positioned (bottom-full) above its parent input. The
 * parent owns the open/query/active-index state and the keyboard handling;
 * this component is purely presentational plus its own outside-click close.
 */
export default function MentionPopover({ items, activeIndex, onSelect, onClose }: MentionPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Close when clicking outside the popover. (Clicks on items call onMouseDown
  // preventDefault so the input keeps focus, then onSelect fires here.)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Keep the active item scrolled into view during keyboard navigation.
  useEffect(() => {
    const list = ref.current;
    if (!list) return;
    const active = list.children[activeIndex + 1] as HTMLElement | undefined; // +1 for header
    active?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (items.length === 0) return null;

  return (
    <div
      ref={ref}
      className="card absolute bottom-full mb-2 left-0 right-0 max-h-60 overflow-y-auto z-50"
      style={{ boxShadow: 'var(--shadow-md)' }}
    >
      <div
        className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider sticky top-0"
        style={{
          color: 'var(--color-neutral-600)',
          borderBottom: '1px solid var(--color-divider)',
          background: 'var(--color-surface)',
        }}
      >
        Reference a document or chapter
      </div>
      {items.map((item, i) => (
        <button
          key={`${item.type}-${item.id}`}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSelect(item)}
          className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
            i === activeIndex ? '' : 'hover:bg-[var(--color-neutral-200)]'
          }`}
          style={
            i === activeIndex
              ? { background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)' }
              : undefined
          }
        >
          {item.type === 'chapter' ? (
            <HiBookOpen className="w-4 h-4 shrink-0" style={{ color: 'var(--color-accent)' }} />
          ) : (
            <HiDocumentText className="w-4 h-4 shrink-0" style={{ color: 'var(--color-accent)' }} />
          )}
          <span className="flex-1 min-w-0 truncate">{item.name}</span>
          <span className="text-[10px] uppercase tracking-wide shrink-0" style={{ opacity: 0.5 }}>
            {item.type}
          </span>
        </button>
      ))}
    </div>
  );
}
