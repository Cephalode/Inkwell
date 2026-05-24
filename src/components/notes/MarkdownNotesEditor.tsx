import { useState } from 'react';
import { HiSave, HiDownload, HiEye, HiPencil } from 'react-icons/hi';
import Button from '../shared/Button';
import Card from '../shared/Card';
import { exportToMarkdown } from '../../services/export/markdownExport';

interface MarkdownNotesEditorProps {
  initialContent?: string;
  title?: string;
  onSave?: (content: string) => void;
}

export default function MarkdownNotesEditor({ initialContent = '', title = 'Untitled Note', onSave }: MarkdownNotesEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [preview, setPreview] = useState(false);
  const [noteTitle, setNoteTitle] = useState(title);

  const handleSave = () => {
    if (onSave) onSave(content);
    // Also save to IndexedDB via the caller
  };

  const handleExport = () => {
    exportToMarkdown(noteTitle, content);
  };

  // Basic markdown → HTML for preview
  const renderMarkdown = (md: string) => {
    return md
      .replace(/^### (.*$)/gim, '<h3 class="text-lg font-bold text-white mt-4 mb-2">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 class="text-xl font-bold text-cyan-400 mt-4 mb-2">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold text-cyan-300 mt-6 mb-3">$1</h1>')
      .replace(/\*\*(.*?)\*\*/gim, '<strong class="text-white">$1</strong>')
      .replace(/\*(.*?)\*/gim, '<em>$1</em>')
      .replace(/^- (.*$)/gim, '<li class="text-slate-200 ml-4">• $1</li>')
      .replace(/^\d+\. (.*$)/gim, '<li class="text-slate-200 ml-4">$1</li>')
      .replace(/`(.*?)`/gim, '<code class="bg-slate-700 px-1.5 py-0.5 rounded text-cyan-300 text-xs">$1</code>')
      .replace(/\n/gim, '<br />');
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <input
          value={noteTitle}
          onChange={(e) => setNoteTitle(e.target.value)}
          className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-200 font-semibold"
          placeholder="Note title..."
        />
        <div className="flex gap-1">
          <Button variant={preview ? 'secondary' : 'primary'} size="sm" onClick={() => setPreview(false)}>
            <HiPencil className="w-4 h-4" /> Edit
          </Button>
          <Button variant={preview ? 'primary' : 'secondary'} size="sm" onClick={() => setPreview(true)}>
            <HiEye className="w-4 h-4" /> Preview
          </Button>
          <Button variant="ghost" size="sm" onClick={handleSave}><HiSave className="w-4 h-4" /></Button>
          <Button variant="ghost" size="sm" onClick={handleExport}><HiDownload className="w-4 h-4" /></Button>
        </div>
      </div>

      {preview ? (
        <Card>
          <div
            className="prose prose-invert max-w-none text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
          />
        </Card>
      ) : (
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full h-[500px] px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm text-slate-200 font-mono resize-none focus:outline-none focus:border-cyan-500"
          placeholder="Start writing your notes in Markdown..."
        />
      )}
    </div>
  );
}
