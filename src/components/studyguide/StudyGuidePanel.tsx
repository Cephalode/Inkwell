import { useState } from 'react';
import Button from '../shared/Button';
import Spinner from '../shared/Spinner';
import Card from '../shared/Card';

interface StudyGuidePanelProps {
  onGenerate: () => Promise<string>;
  isLoading: boolean;
}

export default function StudyGuidePanel({ onGenerate, isLoading }: StudyGuidePanelProps) {
  const [guide, setGuide] = useState('');

  const handleGenerate = async () => {
    const result = await onGenerate();
    setGuide(result);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-200">📚 Study Guide</h3>
        <Button onClick={handleGenerate} isLoading={isLoading}>Generate Study Guide</Button>
      </div>
      {isLoading && !guide && <div className="flex justify-center py-10"><Spinner /></div>}
      {guide && (
        <Card>
          <div className="prose prose-invert max-w-none">
            <pre className="whitespace-pre-wrap text-sm text-slate-200 font-sans">{guide}</pre>
          </div>
        </Card>
      )}
    </div>
  );
}
