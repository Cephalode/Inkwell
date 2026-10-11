import { useMemo } from 'react';
import { HiPlay, HiRefresh, HiVideoCamera } from 'react-icons/hi';
import Badge from '../shared/Badge';
import Spinner from '../shared/Spinner';
import { useChapterVideos } from '../../hooks/useChapterVideos';
import type { VideoPick } from '../../types/analysis';

interface VideoListProps {
  chapterId: string;
  subsections: { title: string }[];
}

export default function VideoList({ chapterId, subsections }: VideoListProps) {
  const { status, videos, error, retry } = useChapterVideos(chapterId, true);

  const grouped = useMemo(() => {
    const map = new Map<number, VideoPick[]>();
    for (const pick of videos?.picks ?? []) {
      const list = map.get(pick.subsectionIndex) ?? [];
      list.push(pick);
      map.set(pick.subsectionIndex, list);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [videos]);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--color-divider)' }}>
        <HiVideoCamera className="w-4 h-4" style={{ color: 'var(--color-accent)' }} />
        <h3 className="text-sm">Recommended Videos</h3>
        <div className="flex-1" />
        {status === 'done' && <Badge color="green">Complete</Badge>}
        {status === 'loading' && <Badge color="gray">Searching…</Badge>}
        {status === 'error' && <Badge color="red">Error</Badge>}
      </div>
      <div className="p-4 space-y-4">
        {status === 'loading' && (
          <div className="flex items-center justify-center gap-2 py-6">
            <Spinner size="sm" />
            <span className="text-sm" style={{ opacity: 0.75 }}>Searching YouTube for tutorial videos…</span>
          </div>
        )}
        {status === 'error' && (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error || 'Video search failed.'}</p>
            <button onClick={retry} className="btn btn-primary">
              <HiRefresh className="w-4 h-4" />
              Retry
            </button>
          </div>
        )}
        {status === 'done' && videos && videos.picks.length === 0 && (
          <p className="text-sm" style={{ opacity: 0.5 }}>No suitable videos found.</p>
        )}
        {status === 'done' &&
          grouped.map(([subIndex, picks]) => (
            <div key={subIndex} className="space-y-2">
              <h4 className="card-kicker">
                {subsections[subIndex]?.title ?? `Subsection ${subIndex + 1}`}
              </h4>
              <div className="space-y-2">
                {picks.map((pick) => (
                  <div key={`${subIndex}-${pick.videoId}`} className="flex gap-3">
                    <img
                      src={`https://i.ytimg.com/vi/${pick.videoId}/mqdefault.jpg`}
                      alt=""
                      loading="lazy"
                      className="w-28 shrink-0"
                      style={{ borderRadius: 'var(--radius-md)' }}
                    />
                    <div className="min-w-0 flex-1">
                      <a
                        href={pick.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-start gap-1.5 text-sm font-medium no-underline hover:text-[var(--color-accent-700)] transition-colors"
                        style={{ color: 'inherit' }}
                      >
                        <HiPlay className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: 'var(--color-accent)' }} />
                        <span>{pick.title}</span>
                      </a>
                      <p className="text-xs mt-0.5" style={{ opacity: 0.5 }}>
                        {pick.channel}
                        {pick.channel && pick.duration ? ' · ' : ''}
                        {pick.duration}
                      </p>
                      {pick.reason && (
                        <p className="text-xs italic mt-0.5" style={{ opacity: 0.6 }}>{pick.reason}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
