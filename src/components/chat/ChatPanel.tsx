import { useState, useRef, useEffect } from 'react';
import { HiPaperAirplane } from 'react-icons/hi';
import Button from '../shared/Button';
import Spinner from '../shared/Spinner';
import { ChatMessage as ChatMsg } from '../../types/chat';

interface ChatPanelProps {
  messages: ChatMsg[];
  onSend: (message: string) => Promise<void>;
  isLoading: boolean;
  contextLabel?: string;
}

export default function ChatPanel({ messages, onSend, isLoading, contextLabel }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const msg = input.trim();
    setInput('');
    await onSend(msg);
  };

  return (
    <div className="flex flex-col h-full bg-slate-800/50 rounded-xl border border-slate-700/50">
      {contextLabel && (
        <div className="px-4 py-2 border-b border-slate-700/50 text-xs text-slate-400">
          Context: {contextLabel}
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[400px] max-h-[500px]">
        {messages.length === 0 && (
          <div className="text-center text-slate-500 py-16">
            <p className="text-lg mb-2">💬 Chat with your documents</p>
            <p className="text-sm">Upload a document, then ask questions about it.</p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-xl px-4 py-3 text-sm whitespace-pre-wrap ${
              msg.role === 'user' ? 'bg-cyan-600 text-white' : 'bg-slate-700 text-slate-200'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}
        {isLoading && <div className="flex justify-center"><Spinner size="sm" /></div>}
        <div ref={endRef} />
      </div>
      <div className="p-3 border-t border-slate-700/50">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Ask a question..."
            className="flex-1 px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
          <Button onClick={handleSend} isLoading={isLoading}>
            <HiPaperAirplane className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
