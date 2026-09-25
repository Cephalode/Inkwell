# PRD 11 — Source viewer

Show the original material next to every generated artifact (trust + grounding).

## Observed UX (Turbo)

## Implementation evidence
- "Source" tab renders the original PDF inline (full text layer, scrollable).
- Sources are enumerated: `content_sources (id, content_id, type, mime_type,
  url, title, sort_order, status, video_id, duration_minutes)` — multiple
  sources per content (matches `multi_file_links`).

## Inkwell build
- `content_sources` table (or reuse `documents.file_path` for the single-file
  case; table only when multi-file lands):
  `id, document_id, type (pdf|youtube|audio), url, title, sort_order, status`.
- UI: Source tab on the document page → PDF.js viewer (pdfjs-dist, ~1 dep) for
  PDFs; YouTube embed for links; native `<audio>` for recordings.
- ponytail: single-source viewer first (95% of docs); multi-source merge later.

## Acceptance criteria
- Every document page has a working Source tab for pdf + youtube types.

**Effort:** 2 days. **Skipped:** multi-source, source-text highlighting sync
with notes citations — add when chat citations land.
