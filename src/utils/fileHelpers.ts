export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

export function getFileExtension(filename: string): string {
  return '.' + filename.split('.').pop()?.toLowerCase() || '';
}

export function getFileIcon(type: string): string {
  const icons: Record<string, string> = {
    pdf: '📄', docx: '📝', pptx: '📊', txt: '📃', md: '📝',
    image: '🖼️', audio: '🎵', video: '🎬', epub: '📚',
    xlsx: '📊', csv: '📊', youtube: '▶️',
  };
  return icons[type] || '📎';
}
