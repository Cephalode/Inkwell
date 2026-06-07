# Auto Document Labeling

## Goal

After a PDF (or any supported file) is uploaded and parsed, automatically classify it into a **document category** (e.g. textbook, worksheet, exam, notes, slides, image, article, etc.) using the existing LLM backend, and display the label as a badge on the file card.

## Current Context

- **Upload flow**: `useDocuments.uploadFile()` → `parseFile()` → creates `DocumentFile` with `tags: []` → saves to IndexedDB
- **DocumentFile.tags** already exists as `string[]` — currently always empty, perfect for storing the category label
- **FileCard** already renders badges — currently shows `doc.type.toUpperCase()` (the MIME type like "PDF")
- **Backend**: Express server at `:3002` with `/api/chat` endpoint proxying to GLM-5.1 via Z.ai
- All processing is client-side (browser) — no server-side file storage

## Approach

Send the first ~1500 chars of parsed text to the LLM with a focused classification prompt. The response is a single label string (or short array) that gets saved into `doc.tags`.

### Classification Prompt

Ask the LLM to return a JSON object with:
- `label`: primary category (e.g. "Textbook", "Worksheet", "Exam", "Notes", "Slides", "Reference", "Article", "Lab Manual", "Syllabus")
- `subject`: detected subject area (e.g. "Mathematics", "Biology", "Computer Science", "History")
- `confidence`: 0-1 score

### Implementation

#### 1. Add `classifyDocument()` service (`src/services/classifyDocument.ts`)

- Takes `parsedText: string`
- Truncates to first ~1500 chars
- Calls `/api/chat` with a system prompt that asks for structured JSON classification
- Parses the response to extract label, subject, confidence
- Returns `{ label: string, subject: string, confidence: number }`

#### 2. Update `useDocuments.uploadFile()` (`src/hooks/useDocuments.ts`)

- After `parseFile()` succeeds, call `classifyDocument(parsed.text)`
- Populate `doc.tags` with the returned label + subject (e.g. `["Textbook", "Mathematics"]`)
- If classification fails or times out, fall back gracefully — still save the document, just with empty tags

#### 3. Update `FileCard` (`src/components/upload/FileCard.tsx`)

- Render `doc.tags` as badges instead of (or in addition to) the raw MIME type badge
- Show category as a colored badge, subject as a secondary badge
- Remove or minimize the `doc.type.toUpperCase()` badge since it's redundant when there's a category label

## Files to Change

1. **`src/services/classifyDocument.ts`** — new file, classification logic
2. **`src/hooks/useDocuments.ts`** — call classifier during upload
3. **`src/components/upload/FileCard.tsx`** — display category badges

## Validation

- Upload a PDF textbook → should get tags like `["Textbook", "Biology"]`
- Upload a worksheet → should get tags like `["Worksheet", "Mathematics"]`
- Classification failure → document still uploads, tags just empty
- Badge rendering looks good on file cards

## Risks / Tradeoffs

- **Latency**: Classification adds an LLM round-trip to every upload. Mitigate by running it async (don't block the UI — show the doc immediately, update badges when classification completes).
- **Cost**: Each upload costs one LLM call (~1500 tokens input, ~50 tokens output). Negligible for personal use.
- **Accuracy**: LLM-based classification is heuristic. The prompt should be strict about returning only known categories to avoid label explosion.
