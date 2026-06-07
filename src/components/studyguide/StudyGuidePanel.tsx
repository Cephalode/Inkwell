import { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Button from '../shared/Button';
import Spinner from '../shared/Spinner';
import Card from '../shared/Card';
import { markdownComponents } from './MarkdownStyles';
import TableOfContents from './TableOfContents';
import { exportToMarkdown } from '../../services/export/markdownExport';
import { exportNotesToPDF } from '../../services/export/pdfExport';
import { HiDownload, HiClipboardCopy, HiDocumentText, HiViewList } from 'react-icons/hi';

interface StudyGuidePanelProps {
  onGenerate: () => Promise<string>;
  isLoading: boolean;
  docTitle?: string;
}

export default function StudyGuidePanel({ onGenerate, isLoading, docTitle = 'Study_Guide' }: StudyGuidePanelProps) {
  const [guide, setGuide] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showToc, setShowToc] = useState(false);

  const handleGenerate = async () => {
    setError(null);
    try {
      const result = await onGenerate();
      if (!result) {
        throw new Error('The AI returned an empty response. Please try again.');
      }
      setGuide(result);
    } catch (err: any) {
      const message = err?.message || 'An unexpected error occurred while generating the study guide.';
      setError(message);
      console.error('[StudyGuidePanel] Generation failed:', err);
    }
  };

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(guide);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = guide;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [guide]);

  const handleExportMd = useCallback(() => {
    exportToMarkdown(docTitle, guide);
  }, [docTitle, guide]);

  const handleExportPdf = useCallback(() => {
    exportNotesToPDF(docTitle, guide);
  }, [docTitle, guide]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-slate-200">📚 Study Guide</h3>
        <div className="flex flex-wrap items-center gap-2">
          {guide && (
            <>
              <Button variant="ghost" size="sm" onClick={() => setShowToc((v) => !v)} title="Table of Contents">
                <HiViewList className="w-4 h-4" />
                {showToc ? 'Hide' : 'Contents'}
              </Button>
              <Button variant="ghost" size="sm" onClick={handleCopy} title="Copy to clipboard">
                <HiClipboardCopy className="w-4 h-4" />
                {copied ? 'Copied!' : 'Copy'}
              </Button>
              <Button variant="ghost" size="sm" onClick={handleExportMd} title="Export as Markdown">
                <HiDocumentText className="w-4 h-4" />
                .md
              </Button>
              <Button variant="ghost" size="sm" onClick={handleExportPdf} title="Export as PDF">
                <HiDownload className="w-4 h-4" />
                PDF
              </Button>
            </>
          )}
          <Button onClick={handleGenerate} isLoading={isLoading} disabled={isLoading}>
            Generate Study Guide
          </Button>
        </div>
      </div>

      {/* Loading state with progress message */}
      {isLoading && !guide && (
        <div className="flex flex-col items-center justify-center py-10 gap-3">
          <Spinner />
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

      {/* Generated guide content */}
      {guide && !isLoading && (
        <div className="flex gap-4">
          {showToc && (
            <aside className="hidden md:block w-56 shrink-0">
              <Card className="sticky top-4">
                <TableOfContents markdown={guide} />
              </Card>
            </aside>
          )}
          <Card className="flex-1 min-w-0">
            <div className="prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {guide}
              </ReactMarkdown>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
