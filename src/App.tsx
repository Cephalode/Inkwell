import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect, Suspense, lazy } from 'react';
import Layout from './components/layout/Layout';
import ErrorBoundary from './components/shared/ErrorBoundary';
import LoadingScreen from './components/shared/LoadingScreen';
import DashboardPage from './pages/DashboardPage';
import DocumentsPage from './pages/DocumentsPage';
import DocumentDetailPage from './pages/DocumentDetailPage';
import { useSettingsStore } from './store/settingsStore';
import { useDocuments } from './hooks/useDocuments';

// Lazy-load non-critical pages for better initial load
const TextbookPage = lazy(() => import('./pages/TextbookPage'));
const FlashcardsPage = lazy(() => import('./pages/FlashcardsPage'));
const QuizPage = lazy(() => import('./pages/QuizPage'));
const StudyGuidePage = lazy(() => import('./pages/StudyGuidePage'));
const MindMapPage = lazy(() => import('./pages/MindMapPage'));
const PomodoroPage = lazy(() => import('./pages/PomodoroPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const TutorPage = lazy(() => import('./pages/TutorPage'));
const NotesPage = lazy(() => import('./pages/NotesPage'));
const ConceptPage = lazy(() => import('./pages/ConceptPage'));
const ExamPage = lazy(() => import('./pages/ExamPage'));
const SchedulePage = lazy(() => import('./pages/SchedulePage'));
const CoursesPage = lazy(() => import('./pages/CoursesPage'));

function SuspenseWrapper({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<LoadingScreen />}>{children}</Suspense>;
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
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/documents" element={<DocumentsPage />} />
            <Route path="/documents/:id" element={<DocumentDetailPage />} />
            <Route path="/courses" element={<SuspenseWrapper><CoursesPage /></SuspenseWrapper>} />
            <Route path="/textbook" element={<SuspenseWrapper><TextbookPage /></SuspenseWrapper>} />
            <Route path="/flashcards" element={<SuspenseWrapper><FlashcardsPage /></SuspenseWrapper>} />
            <Route path="/quiz" element={<SuspenseWrapper><QuizPage /></SuspenseWrapper>} />
            <Route path="/study-guide" element={<SuspenseWrapper><StudyGuidePage /></SuspenseWrapper>} />
            <Route path="/mindmap" element={<SuspenseWrapper><MindMapPage /></SuspenseWrapper>} />
            <Route path="/pomodoro" element={<SuspenseWrapper><PomodoroPage /></SuspenseWrapper>} />
            <Route path="/tutor" element={<SuspenseWrapper><TutorPage /></SuspenseWrapper>} />
            <Route path="/notes" element={<SuspenseWrapper><NotesPage /></SuspenseWrapper>} />
            <Route path="/concepts" element={<SuspenseWrapper><ConceptPage /></SuspenseWrapper>} />
            <Route path="/exam" element={<SuspenseWrapper><ExamPage /></SuspenseWrapper>} />
            <Route path="/schedule" element={<SuspenseWrapper><SchedulePage /></SuspenseWrapper>} />
            <Route path="/settings" element={<SuspenseWrapper><SettingsPage /></SuspenseWrapper>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
