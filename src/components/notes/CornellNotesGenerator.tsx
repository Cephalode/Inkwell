import { useState } from 'react';
import Button from '../shared/Button';
import Card from '../shared/Card';
import Spinner from '../shared/Spinner';
import { chatCompletion } from '../../services/ai/client';
import { exportToMarkdown } from '../../services/export/markdownExport';

interface CornellNotesGeneratorProps {
  documentText: string;
  documentName: string;
}

interface CornellNotes {
  title: string;
  cues: string[];
  notes: string[];
  summary: string;
}

export default function CornellNotesGenerator({ documentText, documentName }: CornellNotesGeneratorProps) {
  const [notes, setNotes] = useState<CornellNotes | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const generate = async () => {
    setIsLoading(true);
    try {
      const prompt = 'Generate Cornell-style notes from the following study material.\n\n'
        + 'The Cornell method has 3 sections:\n'
        + '1. CUES (left column): Keywords, questions, and prompts that help recall\n'
        + '2. NOTES (right column): Detailed notes organized by topic\n'
        + '3. SUMMARY (bottom): A brief summary synthesizing the key ideas\n\n'
        + 'Return JSON:\n'
        + '{"title": "descriptive title", "cues": ["cue1", "cue2"], "notes": ["note1", "note2"], "summary": "2-3 sentence summary"}\n\n'
        + 'Material:\n---\n'
        + documentText.slice(0, 8000);

      const result = await chatCompletion([{ role: 'user', content: prompt }]);
      const jsonStr = result.match(/\{[\s\S]*\}/)?.[0] || '{}';
      setNotes(JSON.parse(jsonStr));
    } catch { /* handle */ }
    setIsLoading(false);
  };

  const exportNotes = () => {
    if (!notes) return;
    const cuesText = notes.cues.map((c) => '- ' + c).join('\n');
    const notesText = notes.notes.join('\n\n');
    const content = '# ' + notes.title + '\n\n## Cues\n' + cuesText + '\n\n## Notes\n' + notesText + '\n\n## Summary\n' + notes.summary;
    exportToMarkdown(notes.title, content);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-200">📝 Cornell Notes</h3>
        <div className="flex gap-2">
          {notes && <Button variant="secondary" size="sm" onClick={exportNotes}>Export</Button>}
          <Button onClick={generate} isLoading={isLoading}>Generate Cornell Notes</Button>
        </div>
      </div>

      {isLoading && <div className="flex justify-center py-10"><Spinner /></div>}

      {notes && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card header={<h4 className="text-sm font-semibold text-cyan-400">🔑 Cues</h4>} className="lg:col-span-1">
            <ul className="space-y-2">
              {notes.cues.map((cue, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-200">
                  <span className="text-cyan-500 mt-0.5">▸</span>
                  {cue}
                </li>
              ))}
            </ul>
          </Card>
          <Card header={<h4 className="text-sm font-semibold text-teal-400">📋 Notes</h4>} className="lg:col-span-2">
            <div className="space-y-3">
              {notes.notes.map((note, i) => (
                <p key={i} className="text-sm text-slate-200 leading-relaxed">{note}</p>
              ))}
            </div>
          </Card>
          <Card header={<h4 className="text-sm font-semibold text-yellow-400">📌 Summary</h4>} className="lg:col-span-3">
            <p className="text-sm text-slate-200 leading-relaxed">{notes.summary}</p>
          </Card>
        </div>
      )}
    </div>
  );
}
