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
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const CoursesPage = lazy(() => import('./pages/CoursesPage'));
const CourseDetailPage = lazy(() => import('./pages/CourseDetailPage'));

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
            <Route path="/courses/:id" element={<SuspenseWrapper><CourseDetailPage /></SuspenseWrapper>} />
            <Route path="/textbook" element={<SuspenseWrapper><TextbookPage /></SuspenseWrapper>} />
            <Route path="/settings" element={<SuspenseWrapper><SettingsPage /></SuspenseWrapper>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
