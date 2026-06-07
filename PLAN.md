# Inkwell — Implementation Plan

## Overview
AI-powered study companion. Upload any file type → AI generates flashcards, quizzes, summaries, study guides, mind maps. Special textbook mode for page-range Q&A. Fully client-side (IndexedDB + OpenAI API key).

## Tech Stack
- Vite 6 + React 19 + TypeScript 5.7
- Tailwind CSS 4 (dark cyan/teal theme)
- Zustand 5 (state)
- React Router 7 (navigation)
- pdfjs-dist 4 (PDF parsing + page extraction)
- mammoth (DOCX)
- pptxtojson (PPTX)
- xlsx (XLSX/CSV)
- epubjs (EPUB)
- Tesseract.js 5 (OCR for images)
- @ffmpeg/ffmpeg (audio transcription prep)
- openai SDK (AI chat)
- idb (IndexedDB wrapper)
- recharts 2 (charts)
- react-icons (icons)
- file-saver (export)
- framer-motion (animations)

## Project Structure

```
src/
├── main.tsx                          # App entry point
├── App.tsx                           # Router + providers
├── index.css                         # Tailwind + custom vars
├── vite-env.d.ts
│
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx               # Navigation sidebar
│   │   ├── Header.tsx                # Top bar with search + profile
│   │   └── Layout.tsx                # Main layout wrapper
│   ├── upload/
│   │   ├── UploadZone.tsx            # Drag-and-drop upload area
│   │   ├── FileList.tsx              # Uploaded files grid
│   │   └── FileCard.tsx              # Single file card with actions
│   ├── chat/
│   │   ├── ChatPanel.tsx             # Chat with documents
│   │   ├── ChatMessage.tsx           # Single message bubble
│   │   ├── CitationBadge.tsx         # Source citation display
│   │   └── SuggestedQuestions.tsx    # AI-suggested questions
│   ├── textbook/
│   │   ├── TextbookViewer.tsx        # PDF viewer with page nav
│   │   ├── ChapterSelector.tsx       # Page/chapter range picker
│   │   ├── TextbookChat.tsx          # Q&A for selected pages only
│   │   └── PageThumbnail.tsx         # Small page preview
│   ├── flashcards/
│   │   ├── FlashcardDeck.tsx         # Deck viewer with flip animation
│   │   ├── FlashcardCard.tsx         # Single flashcard (flip)
│   │   ├── FlashcardEditor.tsx       # Create/edit flashcards
│   │   └── SpacedRepetition.tsx      # SR scheduling UI
│   ├── quiz/
│   │   ├── QuizBuilder.tsx           # Quiz generation options
│   │   ├── QuizPlayer.tsx            # Take a quiz
│   │   ├── QuizQuestion.tsx          # Single question renderer
│   │   └── QuizResults.tsx           # Score + review answers
│   ├── summary/
│   │   ├── SummaryPanel.tsx          # Summary display
│   │   └── SummaryOptions.tsx        # TL;DR / Key Points / Detailed
│   ├── studyguide/
│   │   └── StudyGuidePanel.tsx       # Generated study guide view
│   ├── mindmap/
│   │   └── MindMapViewer.tsx         # SVG/Canvas knowledge graph
│   ├── pomodoro/
│   │   ├── PomodoroTimer.tsx         # Timer display + controls
│   │   └── PomodoroSettings.tsx      # Duration settings
│   ├── progress/
│   │   ├── Dashboard.tsx             # Study dashboard
│   │   ├── StreakCalendar.tsx        # Study streak heatmap
│   │   ├── MasteryChart.tsx          # Topic mastery over time
│   │   └── StatsCards.tsx            # Quick stats row
│   ├── export/
│   │   └── ExportDialog.tsx          # Export options modal
│   ├── settings/
│   │   ├── SettingsPanel.tsx         # API key, theme, preferences
│   │   └── ApiKeyInput.tsx           # Secure API key input
│   └── shared/
│       ├── Button.tsx                # Reusable button
│       ├── Modal.tsx                 # Reusable modal
│       ├── Card.tsx                  # Reusable card
│       ├── Badge.tsx                 # Tag/badge
│       ├── ProgressBar.tsx           # Progress indicator
│       ├── Spinner.tsx               # Loading spinner
│       ├── Tooltip.tsx               # Tooltip
│       └── EmptyState.tsx            # Empty state placeholder
│
├── hooks/
│   ├── useAIClient.ts               # OpenAI API wrapper
│   ├── useDocuments.ts              # Document CRUD + parsing
│   ├── useFlashcards.ts             # Flashcard state + SR algo
│   ├── useQuiz.ts                   # Quiz generation + scoring
│   ├── usePomodoro.ts               # Timer logic
│   ├── useProgress.ts               # Study tracking
│   ├── useTextbook.ts               # PDF page extraction
│   ├── useExport.ts                 # Export logic
│   └── useTheme.ts                  # Dark/light toggle
│
├── services/
│   ├── ai/
│   │   ├── client.ts                # OpenAI client setup
│   │   ├── chat.ts                  # Chat completion with context
│   │   ├── flashcardGen.ts          # Flashcard generation prompt
│   │   ├── quizGen.ts               # Quiz generation prompt
│   │   ├── summaryGen.ts            # Summary generation
│   │   ├── studyGuideGen.ts         # Study guide generation
│   │   ├── mindmapGen.ts            # Knowledge graph extraction
│   │   └── prompts.ts               # All system/user prompts
│   ├── parsers/
│   │   ├── pdfParser.ts             # PDF → text + page extraction
│   │   ├── docxParser.ts            # DOCX → text
│   │   ├── pptxParser.ts            # PPTX → text
│   │   ├── imageParser.ts           # Image → OCR text
│   │   ├── audioParser.ts           # Audio → text (Whisper API)
│   │   ├── epubParser.ts            # EPUB → text + chapters
│   │   ├── spreadsheetParser.ts     # XLSX/CSV → text
│   │   ├── youtubeParser.ts         # YouTube URL → transcript
│   │   └── index.ts                 # Parser router by MIME type
│   ├── storage/
│   │   ├── db.ts                    # IndexedDB setup (schema)
│   │   ├── documentStore.ts         # Document CRUD
│   │   ├── flashcardStore.ts        # Flashcard CRUD
│   │   ├── quizStore.ts             # Quiz history CRUD
│   │   ├── progressStore.ts         # Study progress CRUD
│   │   └── settingsStore.ts         # User preferences CRUD
│   ├── rag/
│   │   ├── chunker.ts               # Text chunking for RAG
│   │   ├── embedder.ts              # Generate embeddings (optional)
│   │   └── retriever.ts             # Retrieve relevant chunks
│   └── export/
│       ├── ankiExport.ts            # Anki deck export
│       ├── pdfExport.ts             # PDF export (jsPDF)
│       ├── csvExport.ts             # CSV export
│       └── markdownExport.ts        # Markdown export
│
├── store/
│   ├── documentStore.ts             # Zustand: documents
│   ├── flashcardStore.ts            # Zustand: flashcards
│   ├── quizStore.ts                 # Zustand: quiz state
│   ├── chatStore.ts                 # Zustand: chat messages
│   ├── pomodoroStore.ts             # Zustand: timer state
│   ├── progressStore.ts             # Zustand: study stats
│   ├── settingsStore.ts             # Zustand: user prefs + API key
│   └── uiStore.ts                   # Zustand: sidebar, modals, theme
│
├── types/
│   ├── document.ts                  # Document, ParsedDocument types
│   ├── flashcard.ts                 # Flashcard, Deck, SR data
│   ├── quiz.ts                      # Quiz, Question, Answer types
│   ├── chat.ts                      # Message, Citation types
│   ├── progress.ts                  # StudySession, Streak types
│   └── settings.ts                  # UserSettings type
│
├── utils/
│   ├── chunkText.ts                 # Text splitting utility
│   ├── formatTime.ts                # Time formatting
│   ├── fileHelpers.ts               # MIME detection, size formatting
│   └── constants.ts                 # App constants
│
└── pages/
    ├── DashboardPage.tsx            # Home / study dashboard
    ├── DocumentsPage.tsx            # All uploaded documents
    ├── DocumentDetailPage.tsx       # Single doc → chat/summary/quiz
    ├── TextbookPage.tsx             # Textbook study mode
    ├── FlashcardsPage.tsx           # Flashcard decks + study
    ├── QuizPage.tsx                 # Quiz taking
    ├── StudyGuidePage.tsx           # Generated study guides
    ├── MindMapPage.tsx              # Knowledge graph view
    ├── PomodoroPage.tsx             # Pomodoro timer
    └── SettingsPage.tsx             # Settings

```

## IndexedDB Schema

### Store: `documents`
```
{
  id: string (uuid)
  name: string
  type: 'pdf' | 'docx' | 'pptx' | 'txt' | 'md' | 'image' | 'audio' | 'video' | 'epub' | 'xlsx' | 'csv' | 'youtube'
  mimeType: string
  size: number
  rawBlob: Blob          // original file bytes
  parsedText: string      // extracted full text
  parsedPages?: string[]  // per-page text (PDFs only)
  chapterMarkers?: {title: string, page: number}[] // (EPUB/PDF)
  thumbnail?: string      // base64 preview image
  tags: string[]
  createdAt: number
  updatedAt: number
}
```

### Store: `flashcards`
```
{
  id: string
  documentId: string
  deck: string           // deck name
  front: string
  back: string
  difficulty: 'easy' | 'medium' | 'hard'
  nextReview: number     // timestamp (SR)
  interval: number       // days (SR)
  easeFactor: number     // SM-2 factor
  reviewCount: number
  createdAt: number
}
```

### Store: `quizzes`
```
{
  id: string
  documentId: string
  title: string
  questions: Question[]  // embedded
  score?: number
  completedAt?: number
  createdAt: number
}

Question = {
  id: string
  type: 'multiple_choice' | 'true_false' | 'fill_blank' | 'short_answer'
  question: string
  options?: string[]     // for MC
  correctAnswer: string
  userAnswer?: string
  explanation?: string
}
```

### Store: `studySessions`
```
{
  id: string
  type: 'flashcard' | 'quiz' | 'pomodoro' | 'chat' | 'reading'
  documentId?: string
  duration: number       // seconds
  date: number           // timestamp
  score?: number
  metadata?: Record<string, any>
}
```

### Store: `settings`
```
{
  id: 'user_settings'    // singleton
  apiKey: string          // encrypted
  apiProvider: 'openai' | 'custom'
  apiBaseUrl: string
  model: string
  theme: 'dark' | 'light'
  pomodoroWork: number    // minutes
  pomodoroBreak: number
  defaultSummaryType: 'tldr' | 'keypoints' | 'detailed'
}
```

## Module Interfaces

### Parsers (services/parsers/index.ts)
```ts
interface ParseResult {
  text: string
  pages?: string[]           // page-indexed text (PDF)
  chapters?: ChapterMarker[] // chapter markers
  metadata?: Record<string, string>
}

function parseFile(file: File): Promise<ParseResult>
function parsePDFPageRange(file: Blob, startPage: number, endPage: number): Promise<string>
```

### AI Service (services/ai/client.ts)
```ts
interface AIService {
  chat(messages: ChatMessage[], context: string): Promise<string>
  generateFlashcards(text: string, count: number): Promise<Flashcard[]>
  generateQuiz(text: string, options: QuizOptions): Promise<Quiz>
  generateSummary(text: string, type: SummaryType): Promise<string>
  generateStudyGuide(text: string): Promise<string>
  extractConcepts(text: string): Promise<MindMapNode[]>
}
```

### Textbook Mode (services/parsers/pdfParser.ts)
```ts
// Key function: extract only specific pages, NOT the whole book
function extractPageRange(pdfBytes: ArrayBuffer, start: number, end: number): Promise<string>
// This is the critical feature — page-level extraction to avoid sending entire textbooks to AI context
```

## Implementation Tasks

### Batch 1: Foundation (Eng Alpha)
1. **Project scaffold** — Vite + React + TS + Tailwind + router + base files
2. **Tailwind theme** — Dark cyan/teal color tokens, light variant, global styles
3. **Layout** — Sidebar + Header + main content area, responsive
4. **Settings store + page** — API key input, provider config, theme toggle
5. **Shared components** — Button, Modal, Card, Badge, Spinner, EmptyState

### Batch 2: Core — Documents + Parsers (Eng Alpha)
6. **IndexedDB setup** — Schema, all stores, CRUD operations
7. **File upload** — Drag-drop zone, multi-file, progress, MIME detection
8. **PDF parser** — Full text + per-page extraction + thumbnail generation
9. **DOCX/PPTX/TXT/MD parsers** — Text extraction from common formats
10. **Image OCR parser** — Tesseract.js integration
11. **Audio parser** — Send to Whisper API for transcription
12. **EPUB parser** — Chapter extraction
13. **XLSX/CSV parser** — Spreadsheet to text
14. **YouTube parser** — Transcript extraction from URL
15. **Document list + detail pages** — CRUD UI for documents

### Batch 3: Core — AI Features (Eng Beta, parallel with Batch 2)
16. **AI client setup** — OpenAI SDK, configurable provider/model
17. **Chat with documents** — RAG: chunk → retrieve → chat with citations
18. **Text chunker + RAG** — Text splitting, similarity search
19. **Flashcard generation** — AI generates flashcards from document text
20. **Flashcard study** — Deck viewer, flip animation, SM-2 spaced repetition
21. **Quiz generation** — AI generates quizzes (MC, TF, fill-blank, short answer)
22. **Quiz player** — Take quiz, score, review
23. **Summary generation** — TL;DR, key points, detailed

### Batch 4: Advanced Features (Eng Alpha + Beta)
24. **Textbook study mode** — PDF viewer + page range selector + scoped Q&A
25. **Study guide generation** — Comprehensive study guide from materials
26. **Mind map / knowledge graph** — SVG-based concept visualization
27. **Pomodoro timer** — Timer + settings + session tracking
28. **Progress dashboard** — Streaks, mastery charts, stats cards, study heatmap
29. **Export** — Anki, PDF, CSV, Markdown export for all content types

### Batch 5: Polish (Eng Alpha)
30. **Responsive design pass** — Mobile layouts for all pages
31. **Animations** — Framer Motion page transitions, card flips
32. **Error handling** — Toast notifications, error boundaries
33. **Empty states** — Illustrated empty states for each section
34. **Keyboard shortcuts** — Global shortcuts for common actions

## File Assignments for Engineering Teams

### Eng Alpha (files they OWN — Eng Beta must NOT touch):
- `src/components/layout/*`
- `src/components/shared/*`
- `src/components/upload/*`
- `src/components/settings/*`
- `src/components/textbook/*`
- `src/components/pomodoro/*`
- `src/components/progress/*`
- `src/components/export/*`
- `src/pages/DashboardPage.tsx`
- `src/pages/DocumentsPage.tsx`
- `src/pages/DocumentDetailPage.tsx`
- `src/pages/TextbookPage.tsx`
- `src/pages/PomodoroPage.tsx`
- `src/pages/SettingsPage.tsx`
- `src/services/parsers/*`
- `src/services/storage/*`
- `src/services/export/*`
- `src/hooks/useDocuments.ts`
- `src/hooks/useTextbook.ts`
- `src/hooks/usePomodoro.ts`
- `src/hooks/useProgress.ts`
- `src/hooks/useExport.ts`
- `src/hooks/useTheme.ts`
- `src/store/documentStore.ts`
- `src/store/pomodoroStore.ts`
- `src/store/progressStore.ts`
- `src/store/settingsStore.ts`
- `src/store/uiStore.ts`
- `src/utils/*`
- `src/types/document.ts`
- `src/types/progress.ts`
- `src/types/settings.ts`
- Config files: `package.json`, `vite.config.ts`, `tailwind.config.ts`, `tsconfig.json`

### Eng Beta (files they OWN — Eng Alpha must NOT touch):
- `src/components/chat/*`
- `src/components/flashcards/*`
- `src/components/quiz/*`
- `src/components/summary/*`
- `src/components/studyguide/*`
- `src/components/mindmap/*`
- `src/pages/FlashcardsPage.tsx`
- `src/pages/QuizPage.tsx`
- `src/pages/StudyGuidePage.tsx`
- `src/pages/MindMapPage.tsx`
- `src/services/ai/*`
- `src/services/rag/*`
- `src/hooks/useAIClient.ts`
- `src/hooks/useFlashcards.ts`
- `src/hooks/useQuiz.ts`
- `src/store/flashcardStore.ts`
- `src/store/quizStore.ts`
- `src/store/chatStore.ts`
- `src/types/flashcard.ts`
- `src/types/quiz.ts`
- `src/types/chat.ts`
