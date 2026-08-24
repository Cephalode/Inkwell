import { useState, useEffect, useCallback, useRef } from 'react';
import { getChapterVideos, findChapterVideos } from '../services/api/client';
import { consumeSSE } from '../utils/sse';
import type { ChapterVideos, VideoStatus } from '../types/analysis';

interface VideoEvent {
  type: string;
  message?: string;
  picks?: ChapterVideos['picks'];
  generatedAt?: string;
}

export interface UseChapterVideos {
  status: VideoStatus;
  videos: ChapterVideos | null;
  error: string | null;
  retry: () => void;
}

export function useChapterVideos(chapterId: string | null, enabled: boolean): UseChapterVideos {
  const [status, setStatus] = useState<VideoStatus>('idle');
  const [videos, setVideos] = useState<ChapterVideos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const abortRef = useRef<AbortController | null>(null);

  const retry = useCallback(() => {
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!chapterId || !enabled) return;
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus('loading');
    setVideos(null);
    setError(null);

    (async () => {
      try {
        const cached = await getChapterVideos(chapterId);
        if (controller.signal.aborted) return;
        if (cached) {
          setVideos(cached);
          setStatus('done');
          return;
        }

        const response = await findChapterVideos(chapterId, controller.signal);
        if (controller.signal.aborted) return;
        if (!response.ok || !response.body) {
          throw new Error(`Video search request failed: ${response.status}`);
        }

        await consumeSSE<VideoEvent>(response, (evt) => {
          if (evt.type === 'done') {
            setVideos({ picks: evt.picks ?? [], generatedAt: evt.generatedAt ?? new Date().toISOString() });
            setStatus('done');
          } else if (evt.type === 'error') {
            setStatus('error');
            setError(evt.message ?? 'Video search failed');
          }
        }, controller.signal);
      } catch (err) {
        if (controller.signal.aborted) return;
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Video search failed');
      }
    })();

    return () => {
      controller.abort();
    };
  }, [chapterId, enabled, nonce]);

  return { status, videos, error, retry };
}
