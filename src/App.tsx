import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useEffect, Suspense, lazy } from 'react';
import Layout from './components/layout/Layout';
import ErrorBoundary from './components/shared/ErrorBoundary';
import LoadingScreen from './components/shared/LoadingScreen';
import DashboardPage from './pages/DashboardPage';
import SelectionTTS from './components/shared/SelectionTTS';
import DocumentsPage from './pages/DocumentsPage';
import DocumentDetailPage from './pages/DocumentDetailPage';
import NotFoundPage from './pages/NotFoundPage';
import { useSettingsStore } from './store/settingsStore';
import { useDocuments } from './hooks/useDocuments';

// Lazy-load non-critical pages for better initial load
const TextbookPage = lazy(() => import('./pages/TextbookPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const CoursesPage = lazy(() => import('./pages/CoursesPage'));
const CourseDetailPage = lazy(() => import('./pages/CourseDetailPage'));
const StudyGuidesPage = lazy(() => import('./pages/StudyGuidesPage'));
const StudyGuideDetailPage = lazy(() => import('./pages/StudyGuideDetailPage'));
const FlashcardsPage = lazy(() => import('./pages/FlashcardsPage'));
const FlashcardDetailPage = lazy(() => import('./pages/FlashcardDetailPage'));
const PracticeTestsPage = lazy(() => import('./pages/PracticeTestsPage'));
const PracticeTestDetailPage = lazy(() => import('./pages/PracticeTestDetailPage'));
const CourseraPage = lazy(() => import('./pages/CourseraPage'));
const TopicMapPage = lazy(() => import('./pages/TopicMapPage'));
const LearnPage = lazy(() => import('./pages/LearnPage'));
const LearnStepPage = lazy(() => import('./pages/LearnStepPage'));
const VideoPlanPage = lazy(() => import('./pages/VideoPlanPage'));
const VideoPage = lazy(() => import('./pages/VideoPage'));

function SuspenseWrapper({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<LoadingScreen />}>{children}</Suspense>;
}

function RouteEffects() {
  const location = useLocation();

  // Per-route document title
  useEffect(() => {
    const base = 'Inkwell';
    const segments = location.pathname.split('/').filter(Boolean);
    const section = segments[0];
    const names: Record<string, string> = {
      documents: 'Documents',
      'topic-map': 'Topic map',
      learn: 'Learn',
      courses: 'Courses',
      'study-guides': 'Study Guides',
      flashcards: 'Flashcards',
      tests: 'Practice Tests',
      coursera: 'Coursera',
      textbook: 'Textbook',
      settings: 'Settings',
    };
    document.title = section && names[section]
      ? `${names[section]} — ${base}`
      : base;
  }, [location.pathname]);

  return null;
}

export default function App() {
  const theme = useSettingsStore((s) => s.settings.theme);
  const { loadDocuments } = useDocuments();

  useEffect(() => {
    document.documentElement.className = theme;
  }, [theme]);

  // Hydrate documents from IndexedDB on app start so the Dashboard
  // (and any other page) can display the correct document count immediately.
  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <RouteEffects />
        <SelectionTTS />
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/documents" element={<DocumentsPage />} />
            <Route path="/documents/:id" element={<DocumentDetailPage />} />
            <Route path="/topic-map" element={<SuspenseWrapper><TopicMapPage /></SuspenseWrapper>} />
            <Route path="/learn" element={<SuspenseWrapper><LearnPage /></SuspenseWrapper>} />
            <Route path="/learn/steps/:stepId" element={<SuspenseWrapper><LearnStepPage /></SuspenseWrapper>} />
            <Route path="/learn/videos" element={<SuspenseWrapper><VideoPlanPage /></SuspenseWrapper>} />
            <Route path="/learn/videos/:videoId" element={<SuspenseWrapper><VideoPage /></SuspenseWrapper>} />
            <Route path="/courses" element={<SuspenseWrapper><CoursesPage /></SuspenseWrapper>} />
            <Route path="/courses/:id" element={<SuspenseWrapper><CourseDetailPage /></SuspenseWrapper>} />
            <Route path="/study-guides" element={<SuspenseWrapper><StudyGuidesPage /></SuspenseWrapper>} />
            <Route path="/study-guides/:id" element={<SuspenseWrapper><StudyGuideDetailPage /></SuspenseWrapper>} />
            <Route path="/flashcards" element={<SuspenseWrapper><FlashcardsPage /></SuspenseWrapper>} />
            <Route path="/flashcards/:deckId" element={<SuspenseWrapper><FlashcardDetailPage /></SuspenseWrapper>} />
            <Route path="/tests" element={<SuspenseWrapper><PracticeTestsPage /></SuspenseWrapper>} />
            <Route path="/tests/:testId" element={<SuspenseWrapper><PracticeTestDetailPage /></SuspenseWrapper>} />
            <Route path="/coursera" element={<SuspenseWrapper><CourseraPage /></SuspenseWrapper>} />
            <Route path="/textbook" element={<SuspenseWrapper><TextbookPage /></SuspenseWrapper>} />
            <Route path="/settings" element={<SuspenseWrapper><SettingsPage /></SuspenseWrapper>} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
