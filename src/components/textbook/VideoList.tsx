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
    <div className="bg-slate-800/50 rounded-xl border border-cyan-900/40 backdrop-blur-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/50 bg-slate-800/70">
        <HiVideoCamera className="w-4 h-4 text-cyan-400" />
        <h3 className="text-sm font-semibold text-slate-200">Recommended Videos</h3>
        <div className="flex-1" />
        {status === 'done' && <Badge color="green">Complete</Badge>}
        {status === 'loading' && <Badge color="gray">Searching…</Badge>}
        {status === 'error' && <Badge color="red">Error</Badge>}
      </div>
      <div className="p-4 space-y-4">
        {status === 'loading' && (
          <div className="flex items-center justify-center gap-2 py-6">
            <Spinner size="sm" />
            <span className="text-sm text-slate-300">Searching YouTube for tutorial videos…</span>
          </div>
        )}
        {status === 'error' && (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <p className="text-sm text-red-300">{error || 'Video search failed.'}</p>
            <button
              onClick={retry}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium transition-colors"
            >
              <HiRefresh className="w-4 h-4" />
              Retry
            </button>
          </div>
        )}
        {status === 'done' && videos && videos.picks.length === 0 && (
          <p className="text-sm text-slate-500">No suitable videos found.</p>
        )}
        {status === 'done' &&
          grouped.map(([subIndex, picks]) => (
            <div key={subIndex} className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-cyan-300">
                {subsections[subIndex]?.title ?? `Subsection ${subIndex + 1}`}
              </h4>
              <div className="space-y-2">
                {picks.map((pick) => (
                  <div key={`${subIndex}-${pick.videoId}`} className="flex gap-3">
                    <img
                      src={`https://i.ytimg.com/vi/${pick.videoId}/mqdefault.jpg`}
                      alt=""
                      loading="lazy"
                      className="w-28 shrink-0 rounded-md"
                    />
                    <div className="min-w-0 flex-1">
                      <a
                        href={pick.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-start gap-1.5 text-sm text-slate-200 hover:text-cyan-300 font-medium transition-colors"
                      >
                        <HiPlay className="w-3.5 h-3.5 mt-0.5 shrink-0 text-cyan-400" />
                        <span>{pick.title}</span>
                      </a>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {pick.channel}
                        {pick.channel && pick.duration ? ' · ' : ''}
                        {pick.duration}
                      </p>
                      {pick.reason && (
                        <p className="text-xs text-slate-400 italic mt-0.5">{pick.reason}</p>
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
