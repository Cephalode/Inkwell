// UploadDropdown — Explorer-style command-bar "New ▸" split button.
// Opens a small menu: upload files (delegates to a hidden file input owned by
// the page) or add a link (YouTube → transcript, anything else → bookmark).
import { useEffect, useRef, useState } from 'react';
import { HiArrowUpTray, HiChevronDown, HiLink } from 'react-icons/hi2';

interface UploadDropdownProps {
  disabled?: boolean;
  /** Where uploads will land — shown in the button tooltip + menu caption. */
  destinationName: string;
  onPickFiles: () => void;
  onAddLink: () => void;
}

export default function UploadDropdown({ disabled, destinationName, onPickFiles, onAddLink }: UploadDropdownProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        className="btn btn-primary flex items-center gap-2 text-sm px-3 py-1.5"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        title={`Add to ${destinationName}`}
      >
        <HiArrowUpTray className="w-4 h-4" />
        {disabled ? 'Uploading…' : 'New'}
        <HiChevronDown className="w-3.5 h-3.5" style={{ opacity: 0.7 }} />
      </button>
      {open && (
        <div
          className="card absolute left-0 mt-1 p-1.5 w-56 z-20"
          style={{ boxShadow: 'var(--shadow-md)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="flex items-center gap-3 px-3 py-2 text-sm w-full text-left hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)]"
            style={{ borderRadius: 'var(--radius-md)' }}
            onClick={() => { setOpen(false); onPickFiles(); }}
          >
            <HiArrowUpTray className="w-4 h-4 shrink-0" style={{ color: 'var(--color-accent)' }} />
            Upload file…
          </button>
          <button
            className="flex items-center gap-3 px-3 py-2 text-sm w-full text-left hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)]"
            style={{ borderRadius: 'var(--radius-md)' }}
            onClick={() => { setOpen(false); onAddLink(); }}
          >
            <HiLink className="w-4 h-4 shrink-0" style={{ color: 'var(--color-accent)' }} />
            Add link
          </button>
          <p className="px-3 pt-1 pb-0.5 text-[10px]" style={{ opacity: 0.45 }}>
            Destination: {destinationName} · YouTube links get a transcript
          </p>
        </div>
      )}
    </div>
  );
}
