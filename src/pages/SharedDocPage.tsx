import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import Card from '../components/shared/Card';
import Markdown from '../components/shared/Markdown';
import InkwellLogo from '../components/shared/InkwellLogo';
import Spinner from '../components/shared/Spinner';

interface SharedDoc {
  name: string;
  type: string;
  summary: string | null;
  hasPodcast: boolean;
  podcastUrl: string | null;
}

/** Public read-only shared document page — no sign-in, token is the capability. */
export default function SharedDocPage() {
  const { token } = useParams<{ token: string }>();
  const [doc, setDoc] = useState<SharedDoc | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch(`/api/public/shares/${token}`)
      .then((r) => { if (!r.ok) throw new Error('Share link not found'); return r.json(); })
      .then((d) => { if (!cancelled) setDoc(d); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [token]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-sm" style={{ opacity: 0.6 }}>{error}</p>
        <Link to="/" className="text-sm" style={{ color: 'var(--color-accent)' }}>Go to Inkwell</Link>
      </div>
    );
  }
  if (!doc) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div className="min-h-screen px-4 py-10">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-2">
          <InkwellLogo className="w-6 h-6 text-cyan-400" />
          <span className="text-sm font-semibold">Inkwell</span>
          <span className="text-xs ml-auto" style={{ opacity: 0.4 }}>Shared read-only</span>
        </div>
        <div>
          <h1 className="text-xl font-semibold">{doc.name}</h1>
          <span className="text-xs" style={{ opacity: 0.5 }}>{doc.type.toUpperCase()}</span>
        </div>
        {doc.summary && (
          <Card>
            <div className="max-w-none"><Markdown content={doc.summary} /></div>
          </Card>
        )}
        {doc.hasPodcast && doc.podcastUrl && (
          <Card>
            <h4 className="text-sm font-semibold mb-3">Podcast overview</h4>
            <audio controls className="w-full" src={doc.podcastUrl} preload="none" />
          </Card>
        )}
        <p className="text-xs text-center" style={{ opacity: 0.4 }}>
          Made with <Link to="/" style={{ color: 'var(--color-accent)' }}>Inkwell</Link> — turn anything into notes, flashcards and podcasts
        </p>
      </div>
    </div>
  );
}
