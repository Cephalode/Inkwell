import { useState } from 'react';
import { HiSpeakerphone, HiPlay, HiPause, HiDocumentText } from 'react-icons/hi';
import Button from '../shared/Button';
import Card from '../shared/Card';
import Badge from '../shared/Badge';
import Spinner from '../shared/Spinner';
import { chatCompletion } from '../../services/ai/client';

interface AudioOverviewProps {
  documentText: string;
  documentName: string;
}

export default function AudioOverview({ documentText, documentName }: AudioOverviewProps) {
  const [script, setScript] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [utterance, setUtterance] = useState<SpeechSynthesisUtterance | null>(null);

  const generateScript = async () => {
    setIsLoading(true);
    try {
      const prompt = `Create an engaging audio overview/podcast script about the following study material.
This should be like a brief educational podcast episode (2-3 minutes when read aloud).
Use a conversational, engaging tone. Include:
- A hook/intro
- Key concepts explained clearly
- Interesting connections or insights
- A brief conclusion

Format as a monologue script. Use natural speech patterns with occasional pauses marked with [pause].

Study material:
---
${documentText.slice(0, 6000)}`;

      const result = await chatCompletion([{ role: 'user', content: prompt }]);
      setScript(result);
    } catch { /* handle */ }
    setIsLoading(false);
  };

  const playAudio = () => {
    if (!script) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(script.replace(/\[pause\]/g, '...'));
    u.rate = 1.0;
    u.pitch = 1.0;
    u.onend = () => setIsPlaying(false);
    window.speechSynthesis.speak(u);
    setUtterance(u);
    setIsPlaying(true);
  };

  const pauseAudio = () => {
    window.speechSynthesis.cancel();
    setIsPlaying(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Badge color="teal">🔊 Audio Overview</Badge>
        <Badge color="gray">{documentName}</Badge>
      </div>

      <div className="flex gap-2">
        <Button onClick={generateScript} isLoading={isLoading}>
          <HiSpeakerphone className="w-4 h-4" /> Generate Audio Overview
        </Button>
        {script && (
          <>
            {!isPlaying ? (
              <Button variant="secondary" onClick={playAudio}><HiPlay className="w-4 h-4" /> Play</Button>
            ) : (
              <Button variant="secondary" onClick={pauseAudio}><HiPause className="w-4 h-4" /> Pause</Button>
            )}
          </>
        )}
      </div>

      {isLoading && <div className="flex justify-center py-10"><Spinner /></div>}

      {script && (
        <Card header={
          <div className="flex items-center gap-2">
            <HiSpeakerphone className="w-5 h-5 text-purple-400" />
            <span className="text-sm font-semibold text-slate-200">Podcast Script</span>
          </div>
        }>
          <div className="flex items-center gap-2 mb-3">
            <HiPlay className="w-4 h-4 text-purple-400" />
            <span className="text-xs text-slate-400">Uses browser text-to-speech to read the overview aloud</span>
          </div>
          <pre className="whitespace-pre-wrap text-sm text-slate-200 font-sans leading-relaxed">{script}</pre>
        </Card>
      )}
    </div>
  );
}
