// Server-side YouTube transcript fetcher.
//
// YouTube now gates the timed-text (caption) API behind a "proof of origin"
// token for browser/WEB requests, so simply scraping the watch page no longer
// yields a working caption URL. We instead use the Innertube *ANDROID* player
// API, whose caption track URLs are returned ungated, then download and clean
// the timed-text XML. The classic watch-page scrape is kept as a fallback.

export interface YouTubeTranscriptResult {
  transcript: string;
  videoId: string;
  title: string;
}

interface CaptionTrack {
  baseUrl?: string;
  languageCode?: string;
  kind?: string;
  name?: { simpleText?: string; runs?: Array<{ text?: string }> };
}

interface InnertubePlayerResponse {
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: CaptionTrack[];
    };
  };
  videoDetails?: { title?: string };
  playabilityStatus?: { status?: string; reason?: string };
}

// ── URL helpers ─────────────────────────────────────────────────────────────

const VIDEO_ID_PATTERNS: RegExp[] = [
  /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
  /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
];

/** Extract the 11-char YouTube video ID from a variety of URL formats. */
export function extractVideoId(url: string): string | null {
  for (const p of VIDEO_ID_PATTERNS) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

/** Only YouTube URLs are currently supported for transcript fetching. */
export function canFetchTranscript(url: string): boolean {
  return extractVideoId(url) !== null;
}

// ── HTTP / entity helpers ───────────────────────────────────────────────────

const ENTITY_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

/** Decode the common HTML/XML entities YouTube emits in titles and captions. */
function decodeEntities(s: string): string {
  return s.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/g, (e) => ENTITY_MAP[e] ?? e);
}

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { headers: BROWSER_HEADERS });
  if (!response.ok) {
    throw new Error(`Request to ${url} failed with status ${response.status}`);
  }
  return response.text();
}

/** Extract a human-readable video title from watch-page HTML. */
function extractTitle(html: string): string {
  // Prefer og:title — cleanest, no " - YouTube" suffix.
  const og = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']*)["']/i);
  if (og?.[1]) return decodeEntities(og[1]).trim();

  // Fall back to <title>…</title>.
  const t = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (t?.[1]) {
    return decodeEntities(t[1]).replace(/\s*-\s*YouTube\s*$/i, '').trim();
  }
  return '';
}

// ── Innertube player API (primary path) ─────────────────────────────────────

/**
 * Query YouTube's Innertube player endpoint using the ANDROID client. The
 * ANDROID client's caption track URLs are returned without the proof-of-origin
 * gating that blocks browser/WEB requests.
 */
async function innertubeAndroidPlayer(
  videoId: string,
): Promise<{ tracks: CaptionTrack[] | null; title: string }> {
  try {
    const resp = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // A YouTube Android client UA — required for the ANDROID client context.
        'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)',
      },
      body: JSON.stringify({
        context: {
          client: { clientName: 'ANDROID', clientVersion: '20.10.38', hl: 'en', gl: 'US' },
        },
        videoId,
      }),
    });
    if (!resp.ok) return { tracks: null, title: '' };

    const data = (await resp.json()) as InnertubePlayerResponse;
    const status = data.playabilityStatus?.status;
    if (status && status !== 'OK' && status !== 'LIVE_STREAM_OFFLINE') {
      throw new Error(`Video not playable: ${status} — ${data.playabilityStatus?.reason ?? ''}`);
    }

    const tracks = data.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? null;
    const title = data.videoDetails?.title ?? '';
    return { tracks, title };
  } catch (err) {
    // Re-throw playability errors, swallow network/parse errors so the caller
    // can fall back to the HTML scrape.
    if (err instanceof Error && err.message.startsWith('Video not playable')) throw err;
    return { tracks: null, title: '' };
  }
}

// ── Watch-page caption extraction (fallback path) ───────────────────────────

/**
 * Extract the captionTracks array from watch-page HTML using a balanced-bracket
 * scan (handles nested objects/arrays and escaped quotes robustly).
 */
function extractCaptionTracks(html: string): CaptionTrack[] | null {
  const key = '"captionTracks":';
  const startIdx = html.indexOf(key);
  if (startIdx === -1) return null;
  const arrStart = html.indexOf('[', startIdx);
  if (arrStart === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = arrStart; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
    } else if (ch === '"') {
      inString = true;
    } else if (ch === '[' || ch === '{') {
      depth++;
    } else if (ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) {
        const jsonStr = html.slice(arrStart, i + 1);
        try {
          return JSON.parse(jsonStr) as CaptionTrack[];
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

// ── Caption text download + cleaning ────────────────────────────────────────

/** Strip XML/HTML tags, decode entities, and collapse whitespace. */
function cleanCaptionXml(xml: string): string {
  return decodeEntities(
    xml
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

/** Fetch the plain-text transcript for a single caption track. */
async function fetchCaptionText(track: CaptionTrack): Promise<string> {
  const baseUrl = track.baseUrl;
  if (!baseUrl) return '';

  // Primary fetch (Innertube ANDROID URLs work as-is).
  let text = cleanCaptionXml(await fetchText(baseUrl));
  if (text) return text;

  // Retry with an explicit subtitle format if the default returned nothing.
  if (!baseUrl.includes('fmt=')) {
    try {
      text = cleanCaptionXml(await fetchText(`${baseUrl}&fmt=srv3`));
    } catch {
      /* ignore — handled below */
    }
  }
  return text;
}

/** Pick the best caption track: prefer (non-ASR) English, else any English, else first. */
function pickTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  if (tracks.length === 0) return null;
  const enManual = tracks.find((t) => t.languageCode === 'en' && t.kind !== 'asr');
  if (enManual) return enManual;
  const enAny = tracks.find((t) => t.languageCode?.startsWith('en'));
  if (enAny) return enAny;
  return tracks[0];
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Fetch the transcript, video id, and title for a YouTube URL. */
export async function fetchYouTubeTranscript(
  url: string,
): Promise<YouTubeTranscriptResult> {
  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new Error('Invalid YouTube URL: could not extract video ID');
  }

  // 1. Primary: Innertube ANDROID player API (ungated caption URLs).
  const tracks = await innertubeAndroidPlayer(videoId);
  const captionTracks = tracks.tracks;
  let title = tracks.title;

  // 2. Fallback: scrape the watch page if Innertube returned no tracks.
  if (!captionTracks || captionTracks.length === 0) {
    const html = await fetchText(`https://www.youtube.com/watch?v=${videoId}`);
    if (!title) title = extractTitle(html);
    captionTracks = extractCaptionTracks(html);
  }

  if (!captionTracks || captionTracks.length === 0) {
    throw new Error('No captions available for this video');
  }

  // 3. Pick the best track and download its text.
  const track = pickTrack(captionTracks);
  if (!track?.baseUrl) {
    throw new Error('No captions available for this video');
  }

  const transcript = await fetchCaptionText(track);
  if (!transcript) {
    throw new Error('No captions available for this video');
  }

  return { transcript, videoId, title: title || 'YouTube Video' };
}

/**
 * Generic transcript entry point. Currently only YouTube is supported; any other
 * URL throws a clear, actionable error.
 */
export async function fetchTranscript(
  url: string,
): Promise<YouTubeTranscriptResult> {
  if (!canFetchTranscript(url)) {
    throw new Error('Only YouTube URLs are currently supported');
  }
  return fetchYouTubeTranscript(url);
}
