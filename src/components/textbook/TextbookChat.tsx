import { useState, useRef, useEffect } from 'react';
import { HiPaperAirplane } from 'react-icons/hi';
import Button from '../shared/Button';
import Badge from '../shared/Badge';
import Spinner from '../shared/Spinner';

interface TextbookChatProps {
  onAsk: (question: string) => Promise<string>;
  startPage: number;
  endPage: number;
  isLoading: boolean;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function TextbookChat({ onAsk, startPage, endPage, isLoading }: TextbookChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async () => {
    if (!input.trim() || isLoading) return;
    const question = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: question }]);
    try {
      const answer = await onAsk(question);
      setMessages((prev) => [...prev, { role: 'assistant', content: answer }]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${message}` }]);
    }
  };

  return (
    <div className="card flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--color-divider)' }}>
        <Badge color="cyan">Pages {startPage}-{endPage}</Badge>
        <span className="text-xs" style={{ opacity: 0.6 }}>Answering from selected pages only</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[300px] max-h-[500px]">
        {messages.length === 0 && (
          <div className="text-center py-10" style={{ opacity: 0.5 }}>
            <p>Ask a question about pages {startPage}–{endPage}</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className="max-w-[80%] px-4 py-3 text-sm whitespace-pre-wrap"
              style={
                msg.role === 'user'
                  ? { borderRadius: 'var(--radius-lg)', background: 'var(--color-accent)', color: 'var(--color-bg)' }
                  : { borderRadius: 'var(--radius-lg)', background: 'var(--color-neutral-200)' }
              }
            >
              {msg.content}
            </div>
          </div>
        ))}
        {isLoading && <div className="flex justify-center"><Spinner size="sm" /></div>}
        <div ref={chatEndRef} />
      </div>
      <div className="p-3" style={{ borderTop: '1px solid var(--color-divider)' }}>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder="Ask about these pages..."
            className="input flex-1"
          />
          <Button onClick={handleSubmit} isLoading={isLoading}>
            <HiPaperAirplane className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
