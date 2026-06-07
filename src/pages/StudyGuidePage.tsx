import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import StudyGuidePanel from '../components/studyguide/StudyGuidePanel';
import Card from '../components/shared/Card';
import Button from '../components/shared/Button';
import Spinner from '../components/shared/Spinner';
import EmptyState from '../components/shared/EmptyState';
import { useDocumentStore } from '../store/documentStore';
import { chatCompletion } from '../services/ai/client';
import { STUDY_GUIDE_PROMPT } from '../services/ai/prompts';
import { markdownComponents } from '../components/studyguide/MarkdownStyles';
import TableOfContents from '../components/studyguide/TableOfContents';
import { exportToMarkdown } from '../services/export/markdownExport';
import { exportNotesToPDF } from '../services/export/pdfExport';
import { HiDownload, HiClipboardCopy, HiDocumentText, HiViewList } from 'react-icons/hi';

export default function StudyGuidePage() {
  const documents = useDocumentStore((s) => s.documents);
  const [selectedDoc, setSelectedDoc] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [guideText, setGuideText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showToc, setShowToc] = useState(false);

  const doc = documents.find((d) => d.id === selectedDoc);
  const docTitle = doc?.name ?? 'Study_Guide';

  const handleGenerate = async () => {
    if (!doc?.parsedText) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await chatCompletion([{ role: 'user', content: STUDY_GUIDE_PROMPT(doc.parsedText) }]);
      if (!result) {
        throw new Error('The AI returned an empty response. Please try again.');
      }
      setGuideText(result);
    } catch (err: any) {
      const message = err?.message || 'An unexpected error occurred while generating the study guide.';
      setError(message);
      console.error('[StudyGuide] Generation failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(guideText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = guideText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white mb-1">📖 Study Guide</h1>
        <p className="text-slate-400">Generate comprehensive study guides from your materials</p>
      </div>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <select value={selectedDoc} onChange={(e) => { setSelectedDoc(e.target.value); setGuideText(''); setError(null); }} className="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-200">
          <option value="">Select document...</option>
          {documents.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <Button onClick={handleGenerate} isLoading={isLoading} disabled={!selectedDoc}>Generate Study Guide</Button>
      </div>

      {/* Loading state with progress message */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Spinner size="lg" />
          <p className="text-slate-400 text-sm animate-pulse">Generating study guide…</p>
        </div>
      )}

      {/* Error state */}
      {error && !isLoading && (
        <div className="rounded-lg border border-red-500/30 bg-red-900/20 p-4">
          <div className="flex items-start gap-3">
            <span className="text-red-400 text-lg">⚠️</span>
            <div>
              <h3 className="text-sm font-semibold text-red-300">Generation Failed</h3>
              <p className="text-sm text-red-400/80 mt-1">{error}</p>
              <Button variant="ghost" size="sm" className="mt-3 text-red-300 hover:text-red-200" onClick={handleGenerate}>
                Try Again
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Generated guide */}
      {guideText && !isLoading && (
        <div className="flex gap-4">
          {showToc && (
            <aside className="hidden md:block w-56 shrink-0">
              <Card className="sticky top-4">
                <TableOfContents markdown={guideText} />
              </Card>
            </aside>
          )}
          <Card className="flex-1 min-w-0" header={
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowToc((v) => !v)}>
                <HiViewList className="w-4 h-4" />
                {showToc ? 'Hide' : 'Contents'}
              </Button>
              <Button variant="ghost" size="sm" onClick={handleCopy}>
                <HiClipboardCopy className="w-4 h-4" />
                {copied ? 'Copied!' : 'Copy'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => exportToMarkdown(docTitle, guideText)}>
                <HiDocumentText className="w-4 h-4" />
                .md
              </Button>
              <Button variant="ghost" size="sm" onClick={() => exportNotesToPDF(docTitle, guideText)}>
                <HiDownload className="w-4 h-4" />
                PDF
              </Button>
            </div>
          }>
            <div className="prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {guideText}
              </ReactMarkdown>
            </div>
          </Card>
        </div>
      )}

      {/* Empty state — shown before first generation */}
      {!guideText && !isLoading && !error && (
        <EmptyState
          icon="📖"
          title="No study guide yet"
          description="Select a document above and click Generate Study Guide to create a comprehensive study guide from your materials."
        />
      )}
    </div>
  );
}
