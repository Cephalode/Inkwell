import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDocumentStore } from '../store/documentStore';
import { useChatStore } from '../store/chatStore';
import ChatPanel from '../components/chat/ChatPanel';
import SummaryPanel from '../components/summary/SummaryPanel';
import FlashcardDeck from '../components/flashcards/FlashcardDeck';
import QuizPlayer from '../components/quiz/QuizPlayer';
import StudyGuidePanel from '../components/studyguide/StudyGuidePanel';
import { MindMapPageViewer } from '../components/mindmap/MindMapViewer';
import Card from '../components/shared/Card';
import Button from '../components/shared/Button';
import Spinner from '../components/shared/Spinner';
import { ragChat } from '../services/rag/retriever';
import { chatCompletion } from '../services/ai/client';
import { SUMMARY_PROMPTS, QUIZ_PROMPT, FLASHCARD_PROMPT, STUDY_GUIDE_PROMPT, MINDMAP_PROMPT } from '../services/ai/prompts';
import { ChatMessage, Citation } from '../types/chat';
import { Flashcard } from '../types/flashcard';
import { QuizQuestion } from '../types/quiz';
import Badge from '../components/shared/Badge';
import { generateUUID } from '../utils/uuid';

type Tab = 'chat' | 'summary' | 'flashcards' | 'quiz' | 'studyguide' | 'mindmap';

export default function DocumentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { documents, setCurrentDocument, currentDocument } = useDocumentStore();
  const [tab, setTab] = useState<Tab>('chat');
  const [isLoading, setIsLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    const doc = documents.find((d) => d.id === id);
    if (doc) setCurrentDocument(doc);
  }, [id, documents, setCurrentDocument]);

  if (!currentDocument) {
    return <div className="text-center py-20"><Spinner /><p className="mt-4 text-slate-400">Loading document...</p></div>;
  }

  const doc = currentDocument;
  const text = doc.parsedText || '';

  const handleChat = async (message: string) => {
    const userMsg: ChatMessage = { id: generateUUID(), role: 'user', content: message, timestamp: Date.now() };
    setChatMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    try {
      const { answer } = await ragChat(message, text, chatMessages);
      const asstMsg: ChatMessage = { id: generateUUID(), role: 'assistant', content: answer, timestamp: Date.now() };
      setChatMessages((prev) => [...prev, asstMsg]);
    } catch (err: any) {
      const errMsg: ChatMessage = { id: generateUUID(), role: 'assistant', content: `Error: ${err.message}`, timestamp: Date.now() };
      setChatMessages((prev) => [...prev, errMsg]);
    }
    setIsLoading(false);
  };

  const handleSummary = async (type: 'tldr' | 'keypoints' | 'detailed') => {
    setIsLoading(true);
    try {
      return await chatCompletion([{ role: 'user', content: SUMMARY_PROMPTS[type](text) }]);
    } finally { setIsLoading(false); }
  };

  const handleFlashcards = async () => {
    setIsLoading(true);
    try {
      const result = await chatCompletion([{ role: 'user', content: FLASHCARD_PROMPT(text, 10) }]);
      const parsed = JSON.parse(result.match(/\[.*\]/s)?.[0] || '[]');
      const cards: Flashcard[] = parsed.map((c: any, i: number) => ({
        id: generateUUID(), documentId: doc.id, deck: doc.name,
        front: c.front, back: c.back, difficulty: 'medium' as const,
        nextReview: Date.now(), interval: 1, easeFactor: 2.5, reviewCount: 0, createdAt: Date.now(),
      }));
      setFlashcards(cards);
    } catch { setFlashcards([]); }
    setIsLoading(false);
  };

  const handleQuiz = async () => {
    setIsLoading(true);
    try {
      const result = await chatCompletion([{ role: 'user', content: QUIZ_PROMPT(text, 5, ['multiple_choice', 'true_false']) }]);
      const parsed = JSON.parse(result.match(/\[.*\]/s)?.[0] || '[]');
      setQuizQuestions(parsed.map((q: any) => ({ ...q, id: generateUUID() })));
    } catch { setQuizQuestions([]); }
    setIsLoading(false);
  };

  const handleStudyGuide = async () => {
    setIsLoading(true);
    try {
      return await chatCompletion([{ role: 'user', content: STUDY_GUIDE_PROMPT(text) }]);
    } finally { setIsLoading(false); }
  };

  const handleMindMap = async () => {
    setIsLoading(true);
    try {
      const result = await chatCompletion([{ role: 'user', content: MINDMAP_PROMPT(text) }]);
      const jsonStr = result.match(/\{[\s\S]*\}/)?.[0] || '{"nodes":[],"edges":[]}';
      return JSON.parse(jsonStr);
    } finally { setIsLoading(false); }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'chat', label: '💬 Chat' },
    { key: 'summary', label: '📝 Summary' },
    { key: 'flashcards', label: '🃏 Flashcards' },
    { key: 'quiz', label: '❓ Quiz' },
    { key: 'studyguide', label: '📖 Study Guide' },
    { key: 'mindmap', label: '🧠 Mind Map' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-start sm:items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/documents')}>← Back</Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg sm:text-xl font-bold text-white truncate">{doc.name}</h1>
          <div className="flex gap-2 mt-1 flex-wrap">
            <Badge color="gray">{doc.type.toUpperCase()}</Badge>
            <Badge color="cyan">{(doc.parsedText?.length || 0).toLocaleString()} chars</Badge>
          </div>
        </div>
      </div>

      <div className="flex gap-1 bg-slate-800/50 rounded-lg p-1 border border-slate-700/50 overflow-x-auto -mx-1 px-1 sm:mx-0 sm:px-1">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap ${
              tab === key ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div>
        {tab === 'chat' && <ChatPanel messages={chatMessages} onSend={handleChat} isLoading={isLoading} contextLabel={doc.name} />}
        {tab === 'summary' && <SummaryPanel onGenerate={handleSummary} isLoading={isLoading} />}
        {tab === 'flashcards' && (
          <div>
            <div className="flex justify-end mb-4"><Button onClick={handleFlashcards} isLoading={isLoading} className="w-full sm:w-auto">Generate Flashcards</Button></div>
            <FlashcardDeck cards={flashcards} />
          </div>
        )}
        {tab === 'quiz' && (
          <div>
            <div className="flex justify-end mb-4"><Button onClick={handleQuiz} isLoading={isLoading} className="w-full sm:w-auto">Generate Quiz</Button></div>
            <QuizPlayer questions={quizQuestions} onAnswer={(qid, ans) => setQuizAnswers((p) => ({ ...p, [qid]: ans }))} onComplete={() => setShowResults(true)} answers={quizAnswers} showResults={showResults} />
          </div>
        )}
        {tab === 'studyguide' && <StudyGuidePanel onGenerate={handleStudyGuide} isLoading={isLoading} />}
        {tab === 'mindmap' && <MindMapPageViewer onGenerate={handleMindMap} isLoading={isLoading} />}
      </div>
    </div>
  );
}
