// FilePreview — Drive/Finder-style quick-look modal.
// Renders inline previews for images, PDF (iframe), audio, video, and plain
// text (txt/md/csv). Anything else shows a metadata panel with a Download
// button. Escape / backdrop click closes; ⌘/Ctrl+O or "Open" navigates to the
// full DocumentDetailPage.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { HiX, HiDownload, HiExternalLink, HiDocumentText } from 'react-icons/hi';
import type { DocumentFile } from '../../types/document';
import { formatFileSize, getFileIcon } from '../../utils/fileHelpers';

interface FilePreviewProps {
  doc: DocumentFile | null;
  onClose: () => void;
  onOpenDetail: (doc: DocumentFile) => void;
}

const TEXT_PREVIEW_TYPES = new Set(['txt', 'md', 'csv']);
const TEXT_CHAR_CAP = 400_000;

function isTextLike(doc: DocumentFile) {
  return TEXT_PREVIEW_TYPES.has(doc.type) || doc.mimeType.startsWith('text/');
}

/** Fetches the raw file and shows it as text. Own component so state resets per doc. */
function TextBody({ doc }: { doc: DocumentFile }) {
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/documents/${doc.id}/download`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.text();
      })
      .then((t) => {
        if (!cancelled) setText(t.length > TEXT_CHAR_CAP ? `${t.slice(0, TEXT_CHAR_CAP)}\n\n… (truncated)` : t);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [doc.id]);

  if (failed) return <p className="p-6 text-sm" style={{ opacity: 0.6 }}>Couldn't load file contents.</p>;
  if (text === null) return <p className="p-6 text-sm" style={{ opacity: 0.5 }}>Loading…</p>;
  return (
    <pre
      className="p-5 text-xs leading-relaxed whitespace-pre-wrap break-words m-0"
      style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
    >
      {text}
    </pre>
  );
}

export default function FilePreview({ doc, onClose, onOpenDetail }: FilePreviewProps) {
  // Escape closes; live only while the modal is open.
  useEffect(() => {
    if (!doc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [doc, onClose]);

  if (!doc) return null;

  const src = `/api/documents/${doc.id}/download`;
  const isImage = doc.type === 'image' || doc.mimeType.startsWith('image/');
  const isPdf = doc.type === 'pdf' || doc.mimeType === 'application/pdf';
  const isAudio = doc.type === 'audio' || doc.mimeType.startsWith('audio/');
  const isVideo = doc.type === 'video' || doc.mimeType.startsWith('video/');

  const body = isImage ? (
    <div className="flex items-center justify-center p-4" style={{ background: 'repeating-conic-gradient(#8882 0% 25%, transparent 0% 50%) 50% / 24px 24px' }}>
      <img src={src} alt={doc.name} className="max-w-full rounded-md" style={{ maxHeight: '62vh' }} />
    </div>
  ) : isPdf ? (
    <iframe src={src} title={doc.name} className="w-full rounded-md" style={{ height: '62vh', border: '1px solid var(--color-divider)', background: 'white' }} />
  ) : isAudio ? (
    <div className="flex flex-col items-center gap-4 py-12">
      <span className="text-5xl">{getFileIcon(doc.type)}</span>
      <audio controls autoPlay src={src} className="w-full max-w-md" />
    </div>
  ) : isVideo ? (
    <div className="flex justify-center p-4">
      <video controls autoPlay src={src} title={doc.name} className="w-full bg-black rounded-md" style={{ maxHeight: '62vh' }} />
    </div>
  ) : isTextLike(doc) ? (
    <div className="overflow-auto rounded-md" style={{ maxHeight: '62vh', background: 'var(--color-neutral-100)' }}>
      <TextBody doc={doc} />
    </div>
  ) : (
    <div className="flex flex-col items-center gap-3 py-14">
      <span className="text-5xl">{getFileIcon(doc.type)}</span>
      <p className="text-sm" style={{ opacity: 0.6 }}>No inline preview for this file type.</p>
    </div>
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Preview of ${doc.name}`}
    >
      <div
        className="card w-full max-w-5xl flex flex-col overflow-hidden"
        style={{ maxHeight: '90vh', boxShadow: 'var(--shadow-lg, 0 20px 60px rgba(0,0,0,0.35))' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 shrink-0" style={{ borderBottom: '1px solid var(--color-divider)' }}>
          <span className="text-xl shrink-0">{getFileIcon(doc.type)}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{doc.name}</p>
            <p className="text-xs truncate" style={{ opacity: 0.5 }}>
              {doc.type.toUpperCase()} · {formatFileSize(doc.size)} · {new Date(doc.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
          <a
            href={src}
            download={doc.name}
            className="p-2 transition-colors hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)]"
            style={{ borderRadius: 'var(--radius-md)' }}
            title="Download"
          >
            <HiDownload className="w-5 h-5" />
          </a>
          <button
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 transition-colors hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)]"
            style={{ borderRadius: 'var(--radius-md)' }}
            onClick={() => onOpenDetail(doc)}
            title="Open in detail view"
          >
            <HiExternalLink className="w-4 h-4" />
            <span className="hidden sm:inline">Open</span>
          </button>
          <button
            className="p-2 transition-colors hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)]"
            style={{ borderRadius: 'var(--radius-md)' }}
            onClick={onClose}
            title="Close preview"
          >
            <HiX className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-auto">
          {body}
        </div>

        {/* Footer hint */}
        <div
          className="flex items-center gap-2 px-4 py-2 text-xs shrink-0"
          style={{ borderTop: '1px solid var(--color-divider)', opacity: 0.5 }}
        >
          <HiDocumentText className="w-3.5 h-3.5" />
          {(doc.parsedText ?? '').length > 0
            ? `${doc.parsedText.length.toLocaleString()} characters parsed for AI`
            : 'No parsed text'}
        </div>
      </div>
    </div>,
    document.body,
  );
}
