# textbook-splitter

Standalone CLI that detects chapters in a textbook PDF and splits it into one
PDF per chapter. Node port of inkwell's browser-side
`src/services/chapterExtractor.ts` — same 3-tier detection, validated against
the same 8 test textbooks.

## Install

```bash
cd textbook-splitter
npm install
```

## Usage

```bash
node cli.js book.pdf                 # list detected chapters
node cli.js book.pdf -o chapters/    # write one PDF per chapter
node cli.js book.pdf --method toc -j # force a tier, JSON output
```

Output dir defaults to `./<pdf basename>`. Files are named
`<book> - 01 - Chapter Title.pdf`.

Options:

```
-o, --out <dir>     output directory
-m, --method <m>    auto | outline | toc | font   (default: auto)
-n, --dry-run       list chapters, write nothing
-j, --json          machine-readable chapter list (index, title, startPage, endPage)
-q, --quiet         errors only
```

## Detection tiers

1. **outline** — PDF bookmarks. Most reliable; drills into children of
   Part/Book headings. Front/back matter (preface, index, appendices, …) is
   skipped. Requires ≥2 usable entries.
2. **toc** — parses Contents pages from the first ~30 pages, then calibrates
   the printed→PDF page offset using standalone page numbers after the TOC.
3. **font** — whole-document scan: heading patterns (`Chapter N`, `Part I`,
   `Unit 2`, …) in the top-3 font sizes per page.

## Programmatic use

```js
import { loadPdf, detectChapters, splitRange, computeEndPages } from './lib.mjs';

const { pdf, totalPages, data } = await loadPdf('book.pdf');
const { chapters, method } = await detectChapters(pdf, totalPages);
for (const [i, ch] of computeEndPages(chapters, totalPages).entries()) {
  const bytes = await splitRange(data, ch.page, ch.endPage);
  // bytes: Uint8Array — write to file, upload, etc.
}
```

## Validated

All 8 test PDFs in `../test-pdfs/` produce correct chapter counts via outline
tier: Think Python 21, Think Stats 14, Think Bayes 15, SICP 5, Little Book of
Semaphores 11, Python for Everybody 17, Convex Optimization 11 (appendix
drilled→skipped), ISLR 11. Split page counts sum to the full document.

## Pitfalls

- **pdf.js detaches the buffer** you pass it. `loadPdf()` hands pdf.js a copy
  and keeps the original for `splitRange()` — don't "simplify" that away.
- pdfjs-dist needs the **legacy build** in Node (`pdfjs-dist/legacy/build/pdf.mjs`).
- Tier results differ by design: TOC parsing found 19/21 on Think Python
  (outline is authoritative). `--method` forces a tier for debugging.
