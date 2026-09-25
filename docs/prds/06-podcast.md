# PRD 6 — Podcast v2 (sectioned, transcribed, chat-aware)

Turbo's most-loved feature. We ship a basic auto-podcast today; this brings it
to Turbo parity: named hosts, sectioned chapters with timestamps, synced
transcript, cover art, and chat-over-the-episode.

## Observed UX (Turbo)
- Podcast tab: "My Podcasts" list + "Create New Podcast".
- Player: generated cover art per episode, two named host avatars (**Heart**,
  **Rachel** from `podcast_speakers`), scrub bar, 1x speed.
- **Sections** view: chapter list with titles + durations ("Linear Regression
  and Classification · 1:53"); **Full Transcript** view: `Speaker: line` with
  per-line speaker attribution, tracks playback.
- Chat integration: player open → "Listening to a podcast? Ask me about
  anything you hear in the episode." (transcript RAG-indexed). **Raise Hand**
  queues a listener question into the show.
- Failure: "We couldn't load this podcast audio. / Try again".
- Assets: `podcasts.api-turbo.ai/<student_id>/<podcast_id>/audio_content.mp3`
  + `cover_art.jpg`.

## Implementation evidence
- `GET rest/v1/podcast_speakers` (host personas table).
- Dedicated podcast service per episode id; transcript is structured text with
  speaker turns and section boundaries; durations per section.

## Inkwell build
### Script format (change the generator to emit this)
```json
{"title":"…","sections":[{"title":"Linear Regression","lines":
  [{"speaker":"host","text":"…"},{"speaker":"guest","text":"…"}]}]}
```
### Synthesis
- Keep msedge-tts two voices (Andrew=host, Ava=guest). Synthesize per section,
  concat within section, record byte offsets → section start timestamps stored
  with the MP3 path (`documents.podcast = {url, duration_s,
  sections:[{title,start_s}]}`). MP3 concat of same-format frames is
  seekable-safe for chapter jumps.
### Storage
- `documents.podcast jsonb` replaces the bare path we store today. Cover art:
  one static gradient SVG template + doc title text — skip generation.
### UI (PodcastPanel v2)
- Native `<audio>` stays under the hood; add: section list (click=seek to
  start_s), transcript pane auto-scrolling on `timeupdate` (active line =
  last line whose cumulative estimate ≤ currentTime; per-line exact offsets
  only if we store per-line durations — we do, from synthesis), speed toggle.
### Chat-over-podcast
- On podcast completion, index transcript lines into the RAG store with
  timestamps as metadata; chat answers cite "at 3:42".
### ponytail notes
- Raise Hand (inject listener question into audio): skip — needs live TTS
  stitching mid-episode; revisit if anyone asks.
- Multiple episodes per doc ("Create New Podcast"): one auto episode matches
  Turbo's default behavior; add manual regen button only.

## Acceptance criteria
- Section list with working seek; transcript highlights current line (±1).
- Chat question about episode content returns timestamped citation.
- Existing single-file playback doesn't regress for old docs.

**Effort:** 4-6 days. **Skipped:** Raise Hand, voice picking UI, multi-episode — add on demand.
