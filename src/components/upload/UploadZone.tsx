import React, { useCallback, useRef, useState } from 'react';
import { HiCloudUpload, HiDocumentAdd } from 'react-icons/hi';
import Button from '../shared/Button';
import { SUPPORTED_FILE_TYPES } from '../../utils/constants';

interface UploadZoneProps {
  onFilesSelected: (files: File[]) => Promise<void>;
  onUrlSubmit?: (url: string) => Promise<unknown>;
  isLoading?: boolean;
}

const YOUTUBE_URL_RE = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|shorts\/)|youtu\.be\/).+/i;

export default function UploadZone({ onFilesSelected, onUrlSubmit, isLoading }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [mode, setMode] = useState<'file' | 'url'>('file');
  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) {
      try {
        await onFilesSelected(files);
      } catch (err) {
        console.error('File selection failed:', err);
      }
    }
  }, [onFilesSelected]);

  const handleChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length) {
      try {
        await onFilesSelected(files);
      } catch (err) {
        console.error('File selection failed:', err);
      }
    }
    e.target.value = '';
  }, [onFilesSelected]);

  const handleUrlSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      setUrlError('Please paste a YouTube URL');
      return;
    }
    if (!YOUTUBE_URL_RE.test(trimmed)) {
      setUrlError('Please enter a valid YouTube URL (e.g. https://youtube.com/watch?v=…)');
      return;
    }
    setUrlError(null);
    try {
      await onUrlSubmit?.(trimmed);
      // Success — reset back to file mode
      setUrl('');
      setMode('file');
    } catch (err) {
      setUrlError(err instanceof Error ? err.message : 'Failed to process video URL');
    }
  }, [url, onUrlSubmit]);

  return (
    <div className="space-y-3">
      {/* Mode toggle */}
      <div className="flex items-center gap-2 justify-center">
        <button
          onClick={() => { setMode('file'); setUrlError(null); }}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            mode === 'file'
              ? 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200 border border-transparent'
          }`}
        >
          📁 Files
        </button>
        <button
          onClick={() => { setMode('url'); setUrlError(null); }}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            mode === 'url'
              ? 'bg-red-600/20 text-red-300 border border-red-500/30'
              : 'text-slate-400 hover:text-slate-200 border border-transparent'
          }`}
        >
          ▶️ YouTube URL
        </button>
      </div>

      {mode === 'file' ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`relative border-2 border-dashed rounded-2xl p-6 sm:p-12 text-center transition-all duration-300 ${
            isDragging
              ? 'border-cyan-400 bg-cyan-500/10 scale-[1.02]'
              : 'border-slate-600 hover:border-slate-500 bg-slate-800/30'
          }`}
        >
          <HiCloudUpload className={`w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 ${isDragging ? 'text-cyan-400' : 'text-slate-500'}`} />
          <h3 className="text-lg font-semibold text-slate-200 mb-2">
            {isDragging ? 'Drop your files here!' : 'Upload Study Materials'}
          </h3>
          <p className="text-sm text-slate-400 mb-4 sm:mb-6">
            Drag & drop files here, or click to browse. Supports PDF, DOCX, PPTX, images, audio, EPUB, XLSX, CSV, and more.
          </p>
          <input
            type="file"
            multiple
            accept={SUPPORTED_FILE_TYPES.join(',')}
            onChange={handleChange}
            ref={fileInputRef}
            className="hidden"
          />
          <Button isLoading={isLoading} onClick={() => fileInputRef.current?.click()}>
            <HiDocumentAdd className="w-5 h-5" />
            Choose Files
          </Button>
        </div>
      ) : (
        <div className="border-2 border-dashed border-red-500/30 bg-slate-800/30 rounded-2xl p-6 sm:p-10 text-center">
          <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 flex items-center justify-center rounded-full bg-red-500/10">
            <span className="text-3xl sm:text-4xl">▶️</span>
          </div>
          <h3 className="text-lg font-semibold text-slate-200 mb-2">
            Add a YouTube Video
          </h3>
          <p className="text-sm text-slate-400 mb-4 sm:mb-6">
            Paste a YouTube link to auto-fetch the transcript and generate an AI summary.
          </p>
          <form onSubmit={handleUrlSubmit} className="max-w-lg mx-auto flex flex-col sm:flex-row gap-2">
            <input
              type="url"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setUrlError(null); }}
              placeholder="https://www.youtube.com/watch?v=…"
              className="flex-1 px-4 py-2.5 rounded-lg bg-slate-900/70 border border-slate-600 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
              autoFocus
              disabled={isLoading}
            />
            <Button type="submit" isLoading={isLoading} disabled={!onUrlSubmit}>
              Add Video
            </Button>
          </form>
          {urlError && (
            <p className="mt-3 text-sm text-red-400">{urlError}</p>
          )}
        </div>
      )}
    </div>
  );
}
