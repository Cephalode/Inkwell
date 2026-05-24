import { useState } from 'react';
import StudyGuidePanel from '../components/studyguide/StudyGuidePanel';
import Card from '../components/shared/Card';
import Button from '../components/shared/Button';
import EmptyState from '../components/shared/EmptyState';
import { useDocumentStore } from '../store/documentStore';
import { chatCompletion } from '../services/ai/client';
import { STUDY_GUIDE_PROMPT } from '../services/ai/prompts';

export default function StudyGuidePage() {
  const documents = useDocumentStore((s) => s.documents);
  const [selectedDoc, setSelectedDoc] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [guideText, setGuideText] = useState('');

  const doc = documents.find((d) => d.id === selectedDoc);

  const handleGenerate = async () => {
    if (!doc?.parsedText) return;
    setIsLoading(true);
    try {
      const result = await chatCompletion([{ role: 'user', content: STUDY_GUIDE_PROMPT(doc.parsedText) }]);
      setGuideText(result);
    } finally { setIsLoading(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">📖 Study Guide</h1>
        <p className="text-slate-400">Generate comprehensive study guides from your materials</p>
      </div>
      <div className="flex items-center gap-3">
        <select value={selectedDoc} onChange={(e) => { setSelectedDoc(e.target.value); setGuideText(''); }} className="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-200">
          <option value="">Select document...</option>
          {documents.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <Button onClick={handleGenerate} isLoading={isLoading} disabled={!selectedDoc}>Generate Study Guide</Button>
      </div>
      {guideText && (
        <Card>
          <div className="prose prose-invert max-w-none">
            <pre className="whitespace-pre-wrap text-sm text-slate-200 font-sans">{guideText}</pre>
          </div>
        </Card>
      )}
    </div>
  );
}
