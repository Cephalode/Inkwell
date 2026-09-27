import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDocumentStore } from '../store/documentStore';
import SummaryPanel from '../components/summary/SummaryPanel';
import PodcastPanel from '../components/summary/PodcastPanel';
import VideoSummaryPanel from '../components/upload/VideoSummaryPanel';
import SourceViewer from '../components/documents/SourceViewer';
import Card from '../components/shared/Card';
import Button from '../components/shared/Button';
import Spinner from '../components/shared/Spinner';
import { listChapters, getDocument, generateSummary, generatePodcast } from '../services/api/client';
import Badge from '../components/shared/Badge';
import ShareButton from '../components/documents/ShareButton';
import { useAuthStore } from '../store/authStore';
import { getYouTubeVideoId } from '../utils/fileHelpers';
import type { ChapterDocument } from '../types/document';

type Tab = 'summary' | 'chapters' | 'video' | 'source';

export default function DocumentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { documents, setCurrentDocument, currentDocument } = useDocumentStore();
  const [tab, setTab] = useState<Tab>('summary');
  const [chapters, setChapters] = useState<ChapterDocument[]>([]);
  const [chaptersLoading, setChaptersLoading] = useState(!!id);
  const [prevChaptersId, setPrevChaptersId] = useState(id);
  const [prevTabDocId, setPrevTabDocId] = useState<string | undefined>(currentDocument?.id);

  useEffect(() => {
    if (!id) return;
    // Prefer an already-hydrated document from the store; otherwise fetch it
    // directly so a hard refresh (empty store) still resolves the page.
    const existing = documents.find((d) => d.id === id);
    if (existing) {
      setCurrentDocument(existing);
      return;
    }
    let cancelled = false;
    getDocument(id)
      .then((doc) => { if (!cancelled) setCurrentDocument(doc); })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [id, documents, setCurrentDocument]);

  // E1 recency: mark this document as opened (fire-and-forget).
  useEffect(() => {
    if (id) fetch(`${window.location.origin}/api/documents/${id}/opened`, { method: 'POST' }).catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    listChapters(id)
      .then((ch) => { if (!cancelled) setChapters(ch); })
      .catch(console.error)
      .finally(() => { if (!cancelled) setChaptersLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  // Default to the Video Summary tab when a YouTube doc is opened, and reset
  // chapter loading state when the document ID changes. These adjustments are
  // done during render to avoid calling setState inside an effect.
  if (id !== prevChaptersId) {
    setPrevChaptersId(id);
    setChapters([]);
    setChaptersLoading(!!id);
  }
  if (currentDocument?.id !== prevTabDocId) {
    setPrevTabDocId(currentDocument?.id);
    if (currentDocument?.type === 'youtube') {
      setTab('video');
    } else if (currentDocument?.type === 'audio' || currentDocument?.type === 'video') {
      // Media uploads land on the player (Source tab) instead of Summary
      setTab('source');
    }
  }

  if (!currentDocument) {
    return <div className="text-center py-20"><Spinner /><p className="mt-4" style={{ opacity: 0.6 }}>Loading document...</p></div>;
  }

  const doc = currentDocument;

  // Refresh this doc from the server — used to poll while the auto-summary
  // is generating server-side. Plain functions (not hooks): they sit after the
  // loading early-return, and all state goes through the store's getState().
  const refreshSummary = async (docId: string = doc.id) => {
    const updated = await getDocument(docId);
    useDocumentStore.getState().updateDocument(docId, {
      summary: updated.summary,
      summaryStatus: updated.summaryStatus,
      summaryError: updated.summaryError,
      podcastStatus: updated.podcastStatus,
      podcastError: updated.podcastError,
    });
  };

  // Regenerate after a failure — POSTs the summary endpoint and stores the
  // result directly (the endpoint resolves with the finished summary).
  const regenerateSummary = async (docId: string = doc.id) => {
    const result = await generateSummary(docId);
    useDocumentStore.getState().updateDocument(docId, {
      summary: result.summary,
      summaryStatus: result.status,
    });
  };

  // (Re)generate the podcast audio overview — POSTs and polls until done.
  const regeneratePodcast = async (docId: string = doc.id) => {
    await generatePodcast(docId);
    const updated = await getDocument(docId);
    useDocumentStore.getState().updateDocument(docId, {
      podcastStatus: updated.podcastStatus,
    });
    if (updated.podcastStatus !== 'done') throw new Error('Podcast generation failed');
  };

  const isYoutube = doc.type === 'youtube';
  const videoId = isYoutube && doc.filePath ? getYouTubeVideoId(doc.filePath) : null;

  const tabs: { key: Tab; label: string }[] = [
    ...(isYoutube ? [{ key: 'video' as Tab, label: '▶️ Video Summary' }] : []),
    { key: 'summary', label: '📝 Summary' },
    { key: 'source', label: doc.type === 'audio' ? '🎵 Audio' : doc.type === 'video' ? '🎬 Video' : '📄 Source' },
    ...(chapters.length > 0 ? [{ key: 'chapters' as Tab, label: `📑 Chapters (${chapters.length})` }] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-start sm:items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/documents')}>← Back</Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg sm:text-xl truncate">{doc.name}</h1>
          <div className="flex gap-2 mt-1 flex-wrap">
            <Badge color="gray">{doc.type.toUpperCase()}</Badge>
            <Badge color="cyan">{(doc.parsedText?.length || 0).toLocaleString()} chars</Badge>
            <ShareButton docId={doc.id} docName={doc.name} />
            <button
              onClick={useAuthStore.getState().logout}
              className="text-xs px-2.5 py-1.5 ml-auto"
              style={{ opacity: 0.5 }}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>

      <div className="card flex gap-1 p-1 overflow-x-auto -mx-1 px-1 sm:mx-0 sm:px-1">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="px-3 py-2 text-sm font-medium transition-all whitespace-nowrap"
            style={
              tab === key
                ? { background: 'var(--color-accent)', color: 'var(--color-bg)', borderRadius: 'var(--radius-md)' }
                : { opacity: 0.6, borderRadius: 'var(--radius-md)' }
            }
          >
            {label}
          </button>
        ))}
      </div>

      <div>
        {tab === 'video' && isYoutube && (
          <div className="space-y-4">
            {/* YouTube player */}
            {videoId && (
              <div className="relative w-full overflow-hidden bg-black" style={{ aspectRatio: '16 / 9', border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-lg)' }}>
                <iframe
                  className="absolute inset-0 w-full h-full"
                  src={`https://www.youtube.com/embed/${videoId}`}
                  title={doc.name}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            )}
            <Card>
              <VideoSummaryPanel docId={doc.id} existingSummary={doc.videoSummary} />
            </Card>
          </div>
        )}
        {tab === 'source' && <SourceViewer doc={doc} />}
        {tab === 'summary' && (
          <div className="space-y-4">
            <PodcastPanel
              docId={doc.id}
              podcastStatus={doc.podcastStatus}
              podcastError={doc.podcastError}
              podcastSections={doc.podcastSections}
              hasSummary={!!doc.summary}
              onPoll={refreshSummary}
              onGenerate={regeneratePodcast}
            />
            <SummaryPanel
              summary={doc.summary}
              summaryStatus={doc.summaryStatus}
              summaryError={doc.summaryError}
              onPoll={refreshSummary}
              onRetry={regenerateSummary}
            />
          </div>
        )}
        {tab === 'chapters' && (
          chaptersLoading ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : (
            <div className="space-y-2">
              {chapters
                .sort((a, b) => a.chapterIndex - b.chapterIndex)
                .map((ch) => (
                  <div
                    key={ch.id}
                    className="card p-4 transition-colors hover:border-[var(--color-neutral-400)]"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="flex items-center justify-center w-7 h-7 text-xs font-semibold shrink-0"
                        style={{
                          background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
                          color: 'var(--color-accent-700)',
                          borderRadius: 'var(--radius-md)',
                        }}
                      >
                        {ch.chapterIndex + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm truncate">{ch.chapterTitle}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          {ch.startPage != null && ch.endPage != null && (
                            <span className="text-xs" style={{ opacity: 0.5 }}>
                              pp. {ch.startPage}–{ch.endPage}
                            </span>
                          )}
                          <span className="text-xs" style={{ opacity: 0.5 }}>
                            {(ch.parsedText?.length ?? 0).toLocaleString()} chars
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
