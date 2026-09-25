# PRD 5 — Flashcards v2

On-demand deck generation from notes with count presets and free-text steering.

## Observed UX (Turbo)
- Flashcards tab is a *generator* first: "Choose how many flashcards to
  generate from your notes" → 10 Quick review / 20 Standard set / 30
  Comprehensive / 50 Deep dive → "Special Instructions (Optional)" text box →
  "Generate 20 Flashcards". Deck is derived on demand, not pre-baked.

## Implementation evidence
- Generator parameters visible in UI; deck derived from
  `latest_content.markdown`. (Deck storage shapes weren't subscribed in our
  session — assume a cards table keyed to content.)

## Inkwell build
- We have flashcards. Add:
  1. Count presets 10/20/30/50 wired to the GLM prompt (already parameterized? confirm).
  2. "Special instructions" free-text appended to prompt
     ("focus on formulas", "skip chapter 1").
  3. Regenerate keeps existing deck until new one is ready (no flash of empty).
- Schema: `documents.flashcards jsonb` stays; add `flashcard_sets` table only
  when users need multiple decks per doc.
- ponytail: SRS scheduling stays out until asked — Turbo's visible UX has
  flipping/browsing, not an SRS queue.

## Acceptance criteria
- Pick 30 + "focus on derivations" → 30 cards, derivations-weighted.
- Regenerating never shows an empty state.

**Effort:** 1 day. **Skipped:** multi-deck management, SRS, export — add on demand.
