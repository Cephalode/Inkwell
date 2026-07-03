import type { ParsedDocument } from '../../types/document';

/** Minimal shape of a YouTube caption track. */
interface CaptionTrack {
  languageCode: string;
  baseUrl: string;
}

export async function parseYouTube(url: string): Promise<ParsedDocument> {
  const videoId = extractVideoId(url);
  if (!videoId) {
    return { text: '[Invalid YouTube URL]' };
  }

  try {
    // Try fetching transcript via a public API
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
    const html = await response.text();
    
    // Extract captions track
    const captionsMatch = html.match(/"captionTracks":\[(.*?)\]/);
    if (captionsMatch) {
      const tracks = JSON.parse(`[${captionsMatch[1]}]`);
      const enTrack = tracks.find((t: CaptionTrack) => t.languageCode === 'en') || tracks[0];
      if (enTrack?.baseUrl) {
        const captionsRes = await fetch(enTrack.baseUrl);
        const captionsXml = await captionsRes.text();
        const text = captionsXml
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        return { text, metadata: { videoId, url } };
      }
    }
  } catch {
    // Fallback
  }

  return { text: `[Could not extract transcript from YouTube video: ${videoId}]`, metadata: { videoId, url } };
}

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}
