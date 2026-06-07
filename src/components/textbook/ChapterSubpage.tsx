import { useState, useRef, useEffect, useCallback } from 'react';
import { HiArrowLeft, HiPaperAirplane } from 'react-icons/hi';
import Button from '../shared/Button';
import Spinner from '../shared/Spinner';
import TextbookViewer from './TextbookViewer';
import TextbookChat from './TextbookChat';
import { chatCompletion } from '../../services/ai/client';
import { TEXTBOOK_CHAT_PROMPT } from '../../services/ai/prompts';
import { getPDFPageCount } from '../../services/parsers/index';
import type { ChapterDocument } from '../../types/document';

interface ChapterSubpageProps {
  chapter: ChapterDocument;
  onBack: () => void;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export default function ChapterSubpage({ chapter, onBack }: ChapterSubpageProps) {
  const [pageCount, setPageCount] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Calculate page count from the chapter's blob
  useEffect(() => {
    if (chapter.rawBlob) {
      getPDFPageCount(chapter.rawBlob).then(setPageCount).catch(() => setPageCount(1));
    }
  }, [chapter.rawBlob]);

  // Scroll chat to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const askQuestion = useCallback(async (question: string): Promise<string> => {
    setIsLoading(true);
    try {
      const pageRange = `pages ${chapter.startPage}–${chapter.endPage}`;
      const messages = [
        { role: 'system', content: TEXTBOOK_CHAT_PROMPT(chapter.parsedText, pageRange) },
        { role: 'user', content: question },
      ];
      return await chatCompletion(messages);
    } finally {
      setIsLoading(false);
    }
  }, [chapter]);

  const handleChatSubmit = async () => {
    if (!chatInput.trim() || isLoading) return;
    const question = chatInput.trim();
    setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user', content: question }]);
    try {
      const answer = await askQuestion(question);
      setChatMessages((prev) => [...prev, { role: 'assistant', content: answer }]);
    } catch (err: any) {
      setChatMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${err.message}` }]);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <HiArrowLeft className="w-4 h-4" />
          Back to Chapters
        </Button>
        <h2 className="text-lg font-semibold text-slate-200 truncate">{chapter.chapterTitle}</h2>
        <span className="text-xs text-slate-500 shrink-0">
          Pages {chapter.startPage}–{chapter.endPage}
        </span>
      </div>

      {/* Content: Viewer + Chat */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TextbookViewer
          file={chapter.rawBlob || null}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          totalPages={pageCount}
        />
        <TextbookChat
          onAsk={askQuestion}
          startPage={chapter.startPage}
          endPage={chapter.endPage}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
