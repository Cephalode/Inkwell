import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export function useKeyboardShortcuts() {
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Only trigger if not in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      if (e.metaKey || e.ctrlKey) {
        switch (e.key) {
          case 'k': // Cmd+K = search focus
            e.preventDefault();
            const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
            searchInput?.focus();
            break;
          case '1': e.preventDefault(); navigate('/'); break;
          case '2': e.preventDefault(); navigate('/documents'); break;
          case '3': e.preventDefault(); navigate('/flashcards'); break;
          case '4': e.preventDefault(); navigate('/quiz'); break;
          case '5': e.preventDefault(); navigate('/textbook'); break;
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate]);
}
