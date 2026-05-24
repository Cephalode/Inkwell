import React, { useCallback, useState } from 'react';
import { HiCloudUpload, HiDocumentAdd } from 'react-icons/hi';
import Button from '../shared/Button';
import { SUPPORTED_FILE_TYPES } from '../../utils/constants';

interface UploadZoneProps {
  onFilesSelected: (files: File[]) => void;
  isLoading?: boolean;
}

export default function UploadZone({ onFilesSelected, isLoading }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) onFilesSelected(files);
  }, [onFilesSelected]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length) onFilesSelected(files);
    e.target.value = '';
  }, [onFilesSelected]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={`relative border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-300 ${
        isDragging
          ? 'border-cyan-400 bg-cyan-500/10 scale-[1.02]'
          : 'border-slate-600 hover:border-slate-500 bg-slate-800/30'
      }`}
    >
      <HiCloudUpload className={`w-16 h-16 mx-auto mb-4 ${isDragging ? 'text-cyan-400' : 'text-slate-500'}`} />
      <h3 className="text-lg font-semibold text-slate-200 mb-2">
        {isDragging ? 'Drop your files here!' : 'Upload Study Materials'}
      </h3>
      <p className="text-sm text-slate-400 mb-6">
        Drag & drop files here, or click to browse. Supports PDF, DOCX, PPTX, images, audio, EPUB, XLSX, CSV, and more.
      </p>
      <label>
        <input
          type="file"
          multiple
          accept={SUPPORTED_FILE_TYPES.join(',')}
          onChange={handleChange}
          className="hidden"
        />
        <Button isLoading={isLoading} onClick={() => (document.querySelector('input[type=file]') as HTMLInputElement)?.click()}>
          <HiDocumentAdd className="w-5 h-5" />
          Choose Files
        </Button>
      </label>
    </div>
  );
}
