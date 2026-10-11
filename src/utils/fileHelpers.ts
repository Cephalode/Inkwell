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
    xlsx: '📊', csv: '📊', youtube: '▶️', link: '🔗', zip: '🗜️',
  };
  return icons[type] || '📎';
}

/**
 * Extract the 11-character YouTube video ID from a URL.
 * Supports youtu.be/ID, youtube.com/watch?v=ID, /embed/ID, /shorts/ID.
 * Returns null when the URL is not a recognizable YouTube link.
 */
export function getYouTubeVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = u.pathname.slice(1);
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (u.searchParams.get('v')) {
        const id = u.searchParams.get('v')!;
        return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
      }
      const match = u.pathname.match(/\/(embed|shorts)\/([a-zA-Z0-9_-]{11})/);
      if (match) return match[2];
    }
    return null;
  } catch {
    return null;
  }
}
