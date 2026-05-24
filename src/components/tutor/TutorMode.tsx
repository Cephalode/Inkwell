import { useState, useRef, useEffect } from 'react';
import { HiLightBulb, HiPaperAirplane, HiRefresh } from 'react-icons/hi';
import Button from '../shared/Button';
import Card from '../shared/Card';
import Badge from '../shared/Badge';
import Spinner from '../shared/Spinner';
import { chatCompletion } from '../../services/ai/client';

interface TutorModeProps {
  documentText: string;
  documentName: string;
}

interface TutorMessage {
  role: 'tutor' | 'student';
  content: string;
}

const TUTOR_SYSTEM = `You are an expert tutor using the Socratic method. You have been given study material. Your job is to:
1. Ask the student questions about the material to test their understanding
2. When they answer, evaluate their response - be encouraging but honest about gaps
3. If they're wrong, guide them toward the right answer with hints (don't just give the answer)
4. After each exchange, ask a follow-up question to deepen understanding
5. Vary question types: factual recall, conceptual understanding, application, analysis
6. Keep the conversation engaging and adaptive to their level
7. Start by asking what topic they'd like to focus on, or pick an important concept

Study material you are tutoring on:
---
{CONTEXT}
---`;

export default function TutorMode({ documentText, documentName }: TutorModeProps) {
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const startTutor = async () => {
    setStarted(true);
    setIsLoading(true);
    try {
      const systemPrompt = TUTOR_SYSTEM.replace('{CONTEXT}', documentText.slice(0, 8000));
      const response = await chatCompletion([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: "I'm ready to study! Please start tutoring me on this material." },
      ]);
      setMessages([{ role: 'tutor', content: response }]);
    } catch (err: any) {
      setMessages([{ role: 'tutor', content: `Error starting tutor: ${err.message}` }]);
    }
    setIsLoading(false);
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const studentMsg = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'student', content: studentMsg }]);
    setIsLoading(true);

    try {
      const systemPrompt = TUTOR_SYSTEM.replace('{CONTEXT}', documentText.slice(0, 8000));
      const tutorHistory = messages.map((m) => ({
        role: m.role === 'tutor' ? 'assistant' : 'user',
        content: m.content,
      }));
      const response = await chatCompletion([
        { role: 'system', content: systemPrompt },
        ...tutorHistory,
        { role: 'user', content: studentMsg },
      ]);
      setMessages((prev) => [...prev, { role: 'tutor', content: response }]);
    } catch (err: any) {
      setMessages((prev) => [...prev, { role: 'tutor', content: `Error: ${err.message}` }]);
    }
    setIsLoading(false);
  };

  if (!started) {
    return (
      <Card className="text-center py-12">
        <HiLightBulb className="w-16 h-16 text-yellow-400 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-white mb-2">AI Tutor Mode</h3>
        <p className="text-slate-400 max-w-md mx-auto mb-6">
          The AI will ask you questions about <span className="text-cyan-400">{documentName}</span> using the Socratic method.
          It adapts to your level and guides you to deeper understanding.
        </p>
        <Button onClick={startTutor} size="lg">
          <HiLightBulb className="w-5 h-5" />
          Start Tutoring Session
        </Button>
      </Card>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-4">
        <Badge color="yellow">🧑‍🏫 Tutor Mode</Badge>
        <Badge color="gray">{documentName}</Badge>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={() => { setMessages([]); setStarted(false); }}>
          <HiRefresh className="w-4 h-4" /> Reset
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 mb-4 min-h-[400px] max-h-[500px] bg-slate-900/30 rounded-xl p-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'student' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
              msg.role === 'student'
                ? 'bg-cyan-600 text-white rounded-br-md'
                : 'bg-slate-700 text-slate-200 rounded-bl-md border border-slate-600'
            }`}>
              {msg.role === 'tutor' && <span className="text-yellow-400 text-xs block mb-1">🧑‍🏫 Tutor</span>}
              {msg.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-slate-700 rounded-2xl px-4 py-3 border border-slate-600">
              <Spinner size="sm" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Type your answer..."
          className="flex-1 px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          disabled={isLoading}
        />
        <Button onClick={handleSend} isLoading={isLoading}>
          <HiPaperAirplane className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
