# PRD 2 — AI study notes

The core artifact: deep, structured, editable study notes. Every other feature
(quiz, flashcards, podcast, lessons) generates FROM the notes, so notes quality
is the ceiling for the whole product.

## Observed UX (Turbo)
- "Notes" tab = markdown doc with: emoji section headers ("What is statistical
  learning? 📊"), bolded key terms with inline definitions ("Supervised
  Learning: Builds a model to…"), LaTeX properly rendered (`Y=f(X)+ε`),
  comparison structures, chapter-deep coverage (their ISLP notes span the whole
  textbook, not just the summary level).
- Notes are the declared input to flashcards ("generate from your notes").

## Implementation evidence
- `GET rest/v1/latest_content?select=markdown&content_id=eq.<id>` — notes are a
  versioned markdown blob (`pm_schema_version` on content row).
- Source text available separately (`content.full_transcript`).

## Inkwell build
### Generation
- New `generateNotes(documentId)` GLM call, chained after text extraction
  (before summary), temperature ~0.3.
- Prompt skeleton:
  ```
  You are writing study notes from the material below.
  Structure: intro paragraph (2-3 sentences), one H2 section per major topic
  (emoji in header), key terms bolded with one-line definitions, comparison
  tables where the source contrasts concepts, preserve ALL LaTeX as $...$.
  Depth: explain derivations and nuances, not just definitions. Length scales
  with source: ~1 output page per 10 source pages, max ~8000 words.
  Return markdown only.
  ```
- Store as `documents.notes_md`; bump `pm_schema_version`-style
  `notes_version` int on regeneration (regenerate keeps old version for 24h).
- Editable: markdown editor (already have for summary) + autosave debounce 2s.
### RAG
- Notes + full text both go into the existing RAG index (notes chunked at
  headings so citations land on sections).

## Acceptance criteria
- STEM PDF renders LaTeX in notes (KaTeX, test with think-python/Bayes PDFs).
- Notes ≥ chapter depth on a 30-page source: ≥8 H2 sections, ≥1 table.
- User edit survives regeneration within 24h (version conflict prompt).

**Effort:** 2 days. **Skipped:** collaborative editing, comments — nobody asked.
