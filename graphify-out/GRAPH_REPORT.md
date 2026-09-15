# Graph Report - /Users/sqibo/devel/inkwell  (2026-07-16)

## Corpus Check
- 172 files · ~97,027 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 836 nodes · 1759 edges · 52 communities (37 shown, 15 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 12 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Documents & Study Guides UI
- Knowledge Graph UI
- App & AI Client
- Document Parsers
- Dependencies
- Practice Tests & Flashcards
- Chapter Analysis & TTS
- Courses Pages
- Global Chat Agent
- Server Package
- Server & DB Routes
- Layout Components
- PDF Extraction Server
- API Client Mappers
- TS Node Config
- Tsconfig App Compileroptions
- Server Src Generationpipeline
- Src Pages Textbookpage
- Server Routes Videodocuments
- Server Src Transcriptfetcher
- Src Store Chatstore
- Src Services Chapterextractor
- Services Chat Tools
- Package Devdependencies
- Src Hooks Usedocuments
- Public Manifest
- Server Src Materials
- Server Routes Chatsessions
- Server Routes Studyguides
- Package Scripts
- Components Shared Autoresizingtextarea
- Src Hooks Usestudyguides
- Package
- Tsconfig
- Package Devdependencies Eslint
- Plugin React Hooks
- Plugin React Refresh
- Package Devdependencies Globals
- Package Devdependencies Tailwindcss
- Package Devdependencies Tsx
- Devdependencies Types Cors
- Devdependencies Types Express
- Devdependencies Types Node
- Devdependencies Types React
- Types React Dom
- Package Devdependencies Typescript
- Devdependencies Typescript Eslint
- Package Devdependencies Vite

## God Nodes (most connected - your core abstractions)
1. `useDocumentStore` - 26 edges
2. `useCourses()` - 22 edges
3. `DocumentFile` - 18 edges
4. `Spinner()` - 17 edges
5. `compilerOptions` - 16 edges
6. `pool` - 15 edges
7. `compilerOptions` - 15 edges
8. `useDocuments()` - 13 edges
9. `useChapters()` - 12 edges
10. `DocumentsPage()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `parseSpreadsheet()` --references--> `xlsx`  [EXTRACTED]
  src/services/parsers/spreadsheetParser.ts → package.json
- `runGeneration()` --calls--> `collectMaterials()`  [EXTRACTED]
  server/src/generationPipeline.ts → server/src/materials.ts
- `callGLMJson()` --calls--> `parseJSON()`  [EXTRACTED]
  server/src/llm.ts → server/src/subsectionDetector.ts
- `collectMaterials()` --calls--> `extractTextWithFonts()`  [EXTRACTED]
  server/src/materials.ts → server/src/pdfExtractor.ts
- `App()` --calls--> `useDocuments()`  [EXTRACTED]
  src/App.tsx → src/hooks/useDocuments.ts

## Import Cycles
- None detected.

## Communities (52 total, 15 thin omitted)

### Community 0 - "Documents & Study Guides UI"
Cohesion: 0.05
Nodes (42): Badge(), BadgeProps, colors, Button(), ButtonProps, sizes, variants, Card() (+34 more)

### Community 1 - "Knowledge Graph UI"
Cohesion: 0.06
Nodes (49): appearanceSliders, forceSliders, GraphControls(), simSliders, SliderConfig, GraphFilters(), nodeTypeConfig, GraphStats() (+41 more)

### Community 2 - "App & AI Client"
Cohesion: 0.07
Nodes (33): App(), CourseDetailPage, CoursesPage, FlashcardDetailPage, FlashcardsPage, PracticeTestDetailPage, PracticeTestsPage, SettingsPage (+25 more)

### Community 3 - "Document Parsers"
Cohesion: 0.09
Nodes (34): ChapterSelectorProps, TextbookViewer(), TextbookViewerProps, VideoSummaryPanelProps, useTextbook(), DocumentRow, parseDOCX(), EpubSpine (+26 more)

### Community 4 - "Dependencies"
Cohesion: 0.05
Nodes (41): epubjs, framer-motion, idb, katex, mammoth, dependencies, epubjs, framer-motion (+33 more)

### Community 5 - "Practice Tests & Flashcards"
Cohesion: 0.13
Nodes (31): ConfirmDialog(), ConfirmDialogProps, usePracticeTest(), usePracticeTestGeneration(), usePracticeTests(), useTestAttempt(), PracticeTestDetailPage(), ACTIVE_GENERATION_STAGES (+23 more)

### Community 6 - "Chapter Analysis & TTS"
Cohesion: 0.07
Nodes (23): components, MarkdownProps, SPEEDS, TTSOverlay(), buildSubsectionText(), ChapterAnalysisPanel(), ChapterAnalysisPanelProps, DetailBlockProps (+15 more)

### Community 7 - "Courses Pages"
Cohesion: 0.13
Nodes (24): CourseCardProps, CourseDetailProps, EmptyState(), EmptyStateProps, useCourses(), useFlashcardDeck(), useFlashcardGeneration(), useFlashcards() (+16 more)

### Community 8 - "Global Chat Agent"
Cohesion: 0.11
Nodes (25): getToolDisplayLabel(), GlobalChat(), NOTE: Avoid Array.prototype.findLast() (ES2023, Safari < 15.4 / Chrome < 97)., relativeTime(), SessionListDropdown(), TOOL_LABELS, ToolCallSummary(), ToolProgressIndicator() (+17 more)

### Community 9 - "Server Package"
Cohesion: 0.07
Nodes (26): cors, express, multer, pg, dependencies, cors, express, multer (+18 more)

### Community 10 - "Server & DB Routes"
Cohesion: 0.11
Nodes (18): pool, app, ChatMessage, ChatPayload, ChatRequestBody, __dirname, distDir, REAPABLE_TABLES (+10 more)

### Community 11 - "Layout Components"
Cohesion: 0.17
Nodes (15): Header(), Layout(), MobileDrawer(), MobileHeader(), MobileTabBar(), tabs, Sidebar(), InkwellLogo() (+7 more)

### Community 12 - "PDF Extraction Server"
Cohesion: 0.14
Nodes (20): AnalysisResult, DocRow, ParsedAnalysis, router, SubsectionAnalysis, extractTextWithFonts(), groupIntoLines(), Line (+12 more)

### Community 13 - "API Client Mappers"
Cohesion: 0.11
Nodes (15): ChapterRow, ChatSessionRow, CourseRow, createFlashcardDeck(), createPracticeTest(), getFlashcardDeck(), getFlashcardDeckCards(), listFlashcardDecks() (+7 more)

### Community 14 - "TS Node Config"
Cohesion: 0.09
Nodes (21): node, server, vite.config.ts, compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module (+13 more)

### Community 15 - "Tsconfig App Compileroptions"
Cohesion: 0.10
Nodes (20): DOM, src, vite/client, compilerOptions, allowImportingTsExtensions, jsx, lib, module (+12 more)

### Community 16 - "Server Src Generationpipeline"
Cohesion: 0.17
Nodes (16): router, router, checkStale(), EmitFn, GenerationOptions, Material, runGeneration(), updateStatus() (+8 more)

### Community 17 - "Src Pages Textbookpage"
Cohesion: 0.20
Nodes (16): FileCardProps, FileListProps, getPDFPageCount(), useChapters(), TextbookPage(), convertToTextbook(), deleteChapters(), downloadDocumentFile() (+8 more)

### Community 18 - "Server Routes Videodocuments"
Cohesion: 0.13
Nodes (14): __dirname, DocRow, router, rowToDoc(), storage, upload, VALID_LABELS, VALID_SUBJECTS (+6 more)

### Community 19 - "Server Src Transcriptfetcher"
Cohesion: 0.19
Nodes (18): BROWSER_HEADERS, canFetchTranscript(), CaptionTrack, cleanCaptionXml(), decodeEntities(), ENTITY_MAP, extractCaptionTracks(), extractTitle() (+10 more)

### Community 20 - "Src Store Chatstore"
Cohesion: 0.16
Nodes (16): addChatMessage(), ChatMessageRow, createChatSession(), deleteChatSession(), generateChatTitle(), getChatSession(), listChatSessions(), mapChatMessage() (+8 more)

### Community 21 - "Src Services Chapterextractor"
Cohesion: 0.22
Nodes (16): BODY_CHAPTER_PATTERNS, cleanTitle(), detectChapters(), detectChaptersByFontSize(), detectChaptersFromOutline(), detectChaptersFromTOC(), extractTOCPageNumber(), findStandalonePageNumber() (+8 more)

### Community 22 - "Services Chat Tools"
Cohesion: 0.24
Nodes (14): getChapter(), listChapters(), mapChapter(), uploadChapters(), executeToolCall(), handleClassifyDocument(), handleGetChapter(), handleGetCurrentContext() (+6 more)

### Community 23 - "Package Devdependencies"
Cohesion: 0.18
Nodes (11): concurrently, @eslint/js, devDependencies, concurrently, @eslint/js, @tailwindcss/vite, @types/file-saver, @vitejs/plugin-react (+3 more)

### Community 24 - "Src Hooks Usedocuments"
Cohesion: 0.35
Nodes (10): useDocuments(), DocumentDetailPage(), classifyDocument(), createDocumentFromUrl(), deleteDocument(), getDocument(), listDocuments(), mapDocument() (+2 more)

### Community 25 - "Public Manifest"
Cohesion: 0.22
Nodes (8): background_color, description, display, icons, name, short_name, start_url, theme_color

### Community 26 - "Server Src Materials"
Cohesion: 0.31
Nodes (8): analysisToDigest(), ChapterAnalysis, ChapterAnalysisSubsection, collectMaterials(), MaterialSource, truncate(), VideoSummary, pagesToText()

### Community 27 - "Server Routes Chatsessions"
Cohesion: 0.25
Nodes (3): MessageRow, router, SessionRow

### Community 28 - "Server Routes Studyguides"
Cohesion: 0.25
Nodes (6): MaterialAnalysis, MaterialDigest, router, StudyGuideContent, StudyGuideRow, SynthesisResult

### Community 29 - "Package Scripts"
Cohesion: 0.29
Nodes (7): scripts, build, dev, dev:backend, dev:frontend, lint, preview

### Community 30 - "Components Shared Autoresizingtextarea"
Cohesion: 0.52
Nodes (5): AutoResizingTextarea(), AutoResizingTextareaProps, computeMaxHeight(), useAutoResize(), UseAutoResizeOptions

### Community 31 - "Src Hooks Usestudyguides"
Cohesion: 0.57
Nodes (6): useStudyGuides(), createStudyGuide(), deleteStudyGuide(), getStudyGuide(), listStudyGuides(), mapStudyGuide()

### Community 32 - "Package"
Cohesion: 0.40
Nodes (4): name, private, type, version

## Knowledge Gaps
- **258 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+253 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `Dependencies` to `Package`?**
  _High betweenness centrality (0.140) - this node is a cross-community bridge._
- **Why does `parseSpreadsheet()` connect `Document Parsers` to `Dependencies`?**
  _High betweenness centrality (0.136) - this node is a cross-community bridge._
- **Why does `xlsx` connect `Dependencies` to `Document Parsers`?**
  _High betweenness centrality (0.135) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _258 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Documents & Study Guides UI` be split into smaller, more focused modules?**
  _Cohesion score 0.05117117117117117 - nodes in this community are weakly interconnected._
- **Should `Knowledge Graph UI` be split into smaller, more focused modules?**
  _Cohesion score 0.06246799795186892 - nodes in this community are weakly interconnected._
- **Should `App & AI Client` be split into smaller, more focused modules?**
  _Cohesion score 0.06845513413506013 - nodes in this community are weakly interconnected._