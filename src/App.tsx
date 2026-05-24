import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import Layout from './components/layout/Layout';
import DashboardPage from './pages/DashboardPage';
import DocumentsPage from './pages/DocumentsPage';
import DocumentDetailPage from './pages/DocumentDetailPage';
import TextbookPage from './pages/TextbookPage';
import FlashcardsPage from './pages/FlashcardsPage';
import QuizPage from './pages/QuizPage';
import StudyGuidePage from './pages/StudyGuidePage';
import MindMapPage from './pages/MindMapPage';
import PomodoroPage from './pages/PomodoroPage';
import SettingsPage from './pages/SettingsPage';
import TutorPage from './pages/TutorPage';
import NotesPage from './pages/NotesPage';
import ConceptPage from './pages/ConceptPage';
import ExamPage from './pages/ExamPage';
import SchedulePage from './pages/SchedulePage';
import { useSettingsStore } from './store/settingsStore';

export default function App() {
  const theme = useSettingsStore((s) => s.settings.theme);

  useEffect(() => {
    document.documentElement.className = theme;
  }, [theme]);

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/documents/:id" element={<DocumentDetailPage />} />
          <Route path="/textbook" element={<TextbookPage />} />
          <Route path="/flashcards" element={<FlashcardsPage />} />
          <Route path="/quiz" element={<QuizPage />} />
          <Route path="/study-guide" element={<StudyGuidePage />} />
          <Route path="/mindmap" element={<MindMapPage />} />
          <Route path="/pomodoro" element={<PomodoroPage />} />
          <Route path="/tutor" element={<TutorPage />} />
          <Route path="/notes" element={<NotesPage />} />
          <Route path="/concepts" element={<ConceptPage />} />
          <Route path="/exam" element={<ExamPage />} />
          <Route path="/schedule" element={<SchedulePage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
