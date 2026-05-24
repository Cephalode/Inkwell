import Modal from '../shared/Modal';
import Button from '../shared/Button';
import { HiDownload } from 'react-icons/hi';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (format: string) => void;
  title: string;
  formats: { key: string; label: string; icon: string }[];
}

export default function ExportDialog({ isOpen, onClose, onExport, title, formats }: ExportDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Export ${title}`}>
      <div className="grid grid-cols-2 gap-3">
        {formats.map((f) => (
          <button
            key={f.key}
            onClick={() => { onExport(f.key); onClose(); }}
            className="flex items-center gap-3 p-4 rounded-xl bg-slate-700/50 hover:bg-slate-700 border border-slate-600 hover:border-cyan-500/50 transition-all"
          >
            <span className="text-2xl">{f.icon}</span>
            <div className="text-left">
              <p className="text-sm font-medium text-slate-200">{f.label}</p>
            </div>
          </button>
        ))}
      </div>
    </Modal>
  );
}
