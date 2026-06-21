import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDocumentStore } from '../store/documentStore';
import SummaryPanel from '../components/summary/SummaryPanel';
import Card from '../components/shared/Card';
import Button from '../components/shared/Button';
import Spinner from '../components/shared/Spinner';
import { chatCompletion } from '../services/ai/client';
import { SUMMARY_PROMPTS } from '../services/ai/prompts';
import Badge from '../components/shared/Badge';

type Tab = 'summary';

export default function DocumentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { documents, setCurrentDocument, currentDocument } = useDocumentStore();
  const [tab, setTab] = useState<Tab>('summary');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const doc = documents.find((d) => d.id === id);
    if (doc) setCurrentDocument(doc);
  }, [id, documents, setCurrentDocument]);

  if (!currentDocument) {
    return <div className="text-center py-20"><Spinner /><p className="mt-4 text-slate-400">Loading document...</p></div>;
  }

  const doc = currentDocument;
  const text = doc.parsedText || '';

  const handleSummary = async (type: 'tldr' | 'keypoints' | 'detailed') => {
    setIsLoading(true);
    try {
      return await chatCompletion([{ role: 'user', content: SUMMARY_PROMPTS[type](text) }]);
    } finally { setIsLoading(false); }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'summary', label: '📝 Summary' },
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
        {tab === 'summary' && <SummaryPanel onGenerate={handleSummary} isLoading={isLoading} />}
      </div>
    </div>
  );
}
