import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HiDocumentText, HiBookOpen, HiOutlineArrowPath, HiXMark } from 'react-icons/hi2';
import { listTextbooks } from '../../services/api/client';
import { useDocumentStore } from '../../store/documentStore';
import MentionPopover, { type MentionableItem } from '../chat/MentionPopover';

interface NewRoadmapDialogProps {
  courseName: string;
  /** Confirm button label — "Create" by default. */
  confirmLabel?: string;
  /** Called with the path name (optional), trimmed guidance, @-referenced file ids. */
  onConfirm: (name: string, guidance: string, documentIds: string[]) => void;
  onCancel: () => void;
}

const MENTION_CAP = 12;

/**
 * "Create new roadmap" dialog: optional guidance textarea plus an @ mention
 * that references any file in the document tree (documents + textbook
 * chapters, same list as chat). Referenced files are sent as extra generation
 * materials on top of the course's own. Creates a NEW roadmap version —
 * existing versions are kept and switchable. Mount only when shown.
 */
export default function NewRoadmapDialog({
  courseName,
  confirmLabel = 'Create',
  onConfirm,
  onCancel,
}: NewRoadmapDialogProps) {
  const documents = useDocumentStore((s) => s.documents);
  const [name, setName] = useState('');
  const [guidance, setGuidance] = useState('');
  const [refs, setRefs] = useState<MentionableItem[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [textbooks, setTextbooks] = useState<Awaited<ReturnType<typeof listTextbooks>>>([]);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // Same mentionable list as the chat: all documents + textbook chapters.
  const mentionItems = useMemo<MentionableItem[]>(() => {
    const docItems: MentionableItem[] = documents.map((d) => ({ id: d.id, name: d.name, type: 'document' as const }));
    const chapterItems: MentionableItem[] = [];
    for (const tb of textbooks) {
      for (const doc of tb.documents) {
        chapterItems.push({
          id: doc.id,
          name: doc.name.replace(/^\d+\s+/, '').replace(/\.pdf$/i, '') || doc.name,
          type: 'chapter' as const,
          parentId: tb.id,
        });
      }
    }
    const seen = new Set<string>();
    return [...docItems, ...chapterItems].filter((it) => {
      if (seen.has(it.id)) return false;
      seen.add(it.id);
      return true;
    });
  }, [documents, textbooks]);

  const filtered = useMemo(() => {
    const q = mentionQuery.trim().toLowerCase();
    const base = q ? mentionItems.filter((it) => it.name.toLowerCase().includes(q)) : mentionItems;
    return base.slice(0, 8);
  }, [mentionItems, mentionQuery]);
  const clampedIndex = filtered.length ? mentionIndex % filtered.length : 0;

  // Textbooks only load on mount (dialog mounts only when shown).
  useEffect(() => {
    let cancelled = false;
    listTextbooks()
      .then((tbs) => {
        if (!cancelled) setTextbooks(tbs);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Escape closes the popover first, the dialog second.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (mentionOpen) setMentionOpen(false);
        else onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mentionOpen, onCancel]);

  const detectMention = (el: HTMLTextAreaElement, val: string) => {
    const caret = el.selectionStart ?? val.length;
    const before = val.slice(0, caret);
    const atIdx = before.lastIndexOf('@');
    if (atIdx !== -1) {
      const between = before.slice(atIdx + 1);
      if (!/\s/.test(between) && (atIdx === 0 || /\s/.test(before[atIdx - 1]))) {
        setMentionOpen(true);
        setMentionQuery(between);
        setMentionIndex(0);
        return;
      }
    }
    setMentionOpen(false);
  };

  const selectMention = (item: MentionableItem) => {
    const el = textRef.current;
    const val = guidance;
    const caret = el?.selectionStart ?? val.length;
    const before = val.slice(0, caret);
    const atIdx = before.lastIndexOf('@');
    setMentionOpen(false);
    setMentionQuery('');
    if (atIdx === -1) return;
    const after = val.slice(caret);
    const mentionText = `@${item.name} `;
    setGuidance(val.slice(0, atIdx) + mentionText + after);
    setRefs((prev) => (prev.some((r) => r.id === item.id) || prev.length >= MENTION_CAP ? prev : [...prev, item]));
    requestAnimationFrame(() => {
      if (el) {
        const pos = atIdx + mentionText.length;
        el.focus();
        el.setSelectionRange(pos, pos);
      }
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!mentionOpen || filtered.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setMentionIndex((i) => i + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setMentionIndex((i) => i - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      selectMention(filtered[clampedIndex]);
    }
  };

  const submit = () => {
    onConfirm(name.trim(), guidance.trim(), refs.map((r) => r.id));
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 animate-[fadeIn_0.1s_ease-out]"
      onClick={onCancel}
      role="presentation"
    >
      <div
        className="card w-full max-w-lg p-5 space-y-4"
        style={{ boxShadow: 'var(--shadow-lg)' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="regen-dialog-title"
      >
        <div className="space-y-1.5">
          <h2 id="regen-dialog-title" style={{ fontSize: 16 }}>
            Create a new learning path for {courseName}
          </h2>
          <p style={{ fontSize: 14, opacity: 0.65 }}>
            Optional: tell Inkwell how to shape it — e.g. "focus on exam topics" or "skip the theory". Type @ to
            reference files from your documents. Your current path stays switchable, and mastery is never retaught.
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <label className="section-label" style={{ margin: 0, fontSize: 10 }}>
            Name this path (optional)
          </label>
          <input
            className="input w-full"
            maxLength={120}
            placeholder={`e.g. "Exam cram" — defaults to "${courseName} roadmap"`}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="relative">
          <textarea
            ref={textRef}
            className="input w-full"
            rows={3}
            placeholder='e.g. "skim @Chapter 3 and focus on the math"'
            value={guidance}
            onChange={(e) => {
              setGuidance(e.target.value);
              detectMention(e.target, e.target.value);
            }}
            onKeyDown={onKeyDown}
            onBlur={() => setMentionOpen(false)}
          />
          {mentionOpen && (
            <MentionPopover
              items={filtered}
              activeIndex={clampedIndex}
              onSelect={selectMention}
              onClose={() => setMentionOpen(false)}
            />
          )}
        </div>

        {refs.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {refs.map((r) => (
              <span
                key={r.id}
                className="inline-flex max-w-full items-center gap-1"
                style={{
                  fontSize: 12,
                  padding: '2px 8px',
                  borderRadius: 999,
                  border: '1px solid var(--color-divider)',
                  background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)',
                }}
              >
                {r.type === 'chapter' ? (
                  <HiBookOpen className="h-3 w-3 shrink-0" style={{ color: 'var(--color-accent)' }} />
                ) : (
                  <HiDocumentText className="h-3 w-3 shrink-0" style={{ color: 'var(--color-accent)' }} />
                )}
                <span className="truncate">{r.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${r.name}`}
                  onClick={() => setRefs((prev) => prev.filter((x) => x.id !== r.id))}
                  className="shrink-0 transition-colors hover:text-[var(--color-danger)]"
                  style={{ opacity: 0.6 }}
                >
                  <HiXMark className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn btn-secondary" autoFocus>
            Cancel
          </button>
          <button type="button" onClick={submit} className="btn btn-primary">
            <HiOutlineArrowPath className="h-4 w-4" />
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
