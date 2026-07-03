import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDocumentStore } from '../store/documentStore';
import SummaryPanel from '../components/summary/SummaryPanel';
import VideoSummaryPanel from '../components/upload/VideoSummaryPanel';
import Card from '../components/shared/Card';
import Button from '../components/shared/Button';
import Spinner from '../components/shared/Spinner';
import { chatCompletion } from '../services/ai/client';
import { SUMMARY_PROMPTS } from '../services/ai/prompts';
import Badge from '../components/shared/Badge';
import { listChapters } from '../services/api/client';
import { getYouTubeVideoId } from '../utils/fileHelpers';
import type { ChapterDocument } from '../types/document';

type Tab = 'summary' | 'chapters' | 'video';

export default function DocumentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { documents, setCurrentDocument, currentDocument } = useDocumentStore();
  const [tab, setTab] = useState<Tab>('summary');
  const [isLoading, setIsLoading] = useState(false);
  const [chapters, setChapters] = useState<ChapterDocument[]>([]);
  const [chaptersLoading, setChaptersLoading] = useState(!!id);
  const [prevChaptersId, setPrevChaptersId] = useState(id);
  const [prevTabDocId, setPrevTabDocId] = useState<string | undefined>(currentDocument?.id);

  useEffect(() => {
    const doc = documents.find((d) => d.id === id);
    if (doc) setCurrentDocument(doc);
  }, [id, documents, setCurrentDocument]);

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
    }
  }

  if (!currentDocument) {
    return <div className="text-center py-20"><Spinner /><p className="mt-4 text-slate-400">Loading document...</p></div>;
  }

  const doc = currentDocument;
  const text = doc.parsedText || '';

  const handleSummary = async (type: 'tldr' | 'keypoints' | 'detailed') => {
    setIsLoading(true);
    try {
      return await chatCompletion([{ role: 'user', content: SUMMARY_PROMPTS[type](text) }]);
    } finally { setIsLoading(false); }
  };

  const isYoutube = doc.type === 'youtube';
  const videoId = isYoutube && doc.filePath ? getYouTubeVideoId(doc.filePath) : null;

  const tabs: { key: Tab; label: string }[] = [
    ...(isYoutube ? [{ key: 'video' as Tab, label: '▶️ Video Summary' }] : []),
    { key: 'summary', label: '📝 Summary' },
    ...(chapters.length > 0 ? [{ key: 'chapters' as Tab, label: `📑 Chapters (${chapters.length})` }] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-start sm:items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/documents')}>← Back</Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg sm:text-xl font-bold text-white truncate">{doc.name}</h1>
          <div className="flex gap-2 mt-1 flex-wrap">
            <Badge color="gray">{doc.type.toUpperCase()}</Badge>
            <Badge color="cyan">{(doc.parsedText?.length || 0).toLocaleString()} chars</Badge>
          </div>
        </div>
      </div>

      <div className="flex gap-1 bg-slate-800/50 rounded-lg p-1 border border-slate-700/50 overflow-x-auto -mx-1 px-1 sm:mx-0 sm:px-1">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap ${
              tab === key ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
            }`}
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
              <div className="relative w-full overflow-hidden rounded-xl border border-slate-700/50 bg-black" style={{ aspectRatio: '16 / 9' }}>
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
        {tab === 'summary' && <SummaryPanel onGenerate={handleSummary} isLoading={isLoading} />}
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
                    className="rounded-xl bg-slate-800/60 border border-slate-700/50 p-4 hover:border-slate-600 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-cyan-600/20 text-cyan-400 text-xs font-bold shrink-0">
                        {ch.chapterIndex + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium text-slate-200 truncate">{ch.chapterTitle}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          {ch.startPage != null && ch.endPage != null && (
                            <span className="text-xs text-slate-500">
                              pp. {ch.startPage}–{ch.endPage}
                            </span>
                          )}
                          <span className="text-xs text-slate-500">
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
