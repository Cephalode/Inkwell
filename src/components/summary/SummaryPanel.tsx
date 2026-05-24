import { useState } from 'react';
import Button from '../shared/Button';
import Spinner from '../shared/Spinner';
import Card from '../shared/Card';

interface SummaryPanelProps {
  onGenerate: (type: 'tldr' | 'keypoints' | 'detailed') => Promise<string>;
  isLoading: boolean;
}

export default function SummaryPanel({ onGenerate, isLoading }: SummaryPanelProps) {
  const [summary, setSummary] = useState('');
  const [activeType, setActiveType] = useState<'tldr' | 'keypoints' | 'detailed'>('keypoints');

  const handleGenerate = async () => {
    const result = await onGenerate(activeType);
    setSummary(result);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {(['tldr', 'keypoints', 'detailed'] as const).map((t) => (
          <Button
            key={t}
            variant={activeType === t ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => { setActiveType(t); setSummary(''); }}
          >
            {t === 'tldr' ? 'TL;DR' : t === 'keypoints' ? 'Key Points' : 'Detailed'}
          </Button>
        ))}
        <div className="flex-1" />
        <Button onClick={handleGenerate} isLoading={isLoading}>
          Generate Summary
        </Button>
      </div>
      {isLoading && !summary && <div className="flex justify-center py-10"><Spinner /></div>}
      {summary && (
        <Card>
          <div className="prose prose-invert max-w-none">
            <pre className="whitespace-pre-wrap text-sm text-slate-200 font-sans">{summary}</pre>
          </div>
        </Card>
      )}
    </div>
  );
}
