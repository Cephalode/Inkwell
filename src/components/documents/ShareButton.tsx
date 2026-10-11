import { useState } from 'react';
import { HiShare } from 'react-icons/hi';

/** Share button: creates a public read-only link and copies it. */
export default function ShareButton({ docId, docName }: { docId: string; docName: string }) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/documents/${docId}/share`, { method: 'POST' });
      if (!res.ok) throw new Error(`Failed to create share link: ${res.status}`);
      const { token } = await res.json();
      const url = `${window.location.origin}/s/${token}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Share failed:', err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={handleShare}
      disabled={busy}
      title={copied ? 'Link copied!' : `Share "${docName}"`}
      className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 transition-colors hover:opacity-80 disabled:opacity-50"
      style={{
        border: '1px solid var(--color-divider, #3a3835)',
        borderRadius: 'var(--radius-md, 4px)',
      }}
    >
      <HiShare className="w-3.5 h-3.5" />
      {copied ? 'Copied!' : 'Share'}
    </button>
  );
}
