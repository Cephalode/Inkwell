// Source viewer — renders the original material inline (PRD 11).
// ponytail: single-source viewer; multi-file merge only when multi-file uploads land.
import { getYouTubeVideoId } from '../../utils/fileHelpers';
import type { DocumentFile } from '../../types/document';

export default function SourceViewer({ doc }: { doc: DocumentFile }) {
  if (doc.type === 'youtube') {
    const videoId = getYouTubeVideoId(doc.filePath ?? '');
    return videoId ? (
      <div
        className="relative w-full overflow-hidden bg-black"
        style={{ aspectRatio: '16 / 9', border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-lg)' }}
      >
        <iframe
          className="absolute inset-0 w-full h-full"
          src={`https://www.youtube.com/embed/${videoId}`}
          title={doc.name}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    ) : (
      <p className="text-sm" style={{ opacity: 0.6 }}>No video URL stored for this document.</p>
    );
  }

  const src = `/api/documents/${doc.id}/download`;
  if (doc.mimeType === 'application/pdf') {
    return (
      <iframe
        src={src}
        title={doc.name}
        className="w-full bg-black"
        style={{ height: '80vh', border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-lg)' }}
      />
    );
  }
  if (doc.mimeType?.startsWith('audio/')) {
    return <audio controls src={src} className="w-full" />;
  }
  // Images and anything else with a raw file: show it inline; text-only docs: parsed text preview.
  if (doc.mimeType?.startsWith('image/')) {
    return (
      <img
        src={src}
        alt={doc.name}
        className="w-full"
        style={{ border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-lg)' }}
      />
    );
  }
  return (
    <div
      className="card p-4 text-sm whitespace-pre-wrap max-h-[70vh] overflow-y-auto"
      style={{ opacity: 0.85 }}
    >
      {doc.parsedText?.slice(0, 20000) || 'No parsed text available for this document.'}
    </div>
  );
}
