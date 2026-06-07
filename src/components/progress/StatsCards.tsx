import Card from '../shared/Card';
import { HiClock, HiDocumentText, HiAcademicCap, HiFire } from 'react-icons/hi';
import { formatSeconds } from '../../utils/formatTime';

interface StatsCardsProps {
  stats: {
    totalStudyTime: number;
    totalDocuments: number;
    flashcardsReviewed: number;
    quizzesTaken: number;
    currentStreak: number;
  };
  documentCount?: number;
  onDocumentsClick?: () => void;
}

const cards = [
  { key: 'totalStudyTime', label: 'Study Time', icon: HiClock, format: (v: number) => formatSeconds(v), color: 'text-cyan-400' },
  { key: 'totalDocuments', label: 'Documents', icon: HiDocumentText, format: (v: number) => v.toString(), color: 'text-teal-400' },
  { key: 'flashcardsReviewed', label: 'Cards Reviewed', icon: HiAcademicCap, format: (v: number) => v.toString(), color: 'text-green-400' },
  { key: 'currentStreak', label: 'Day Streak', icon: HiFire, format: (v: number) => `${v} days`, color: 'text-orange-400' },
];

export default function StatsCards({ stats, documentCount, onDocumentsClick }: StatsCardsProps) {
  return (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
    {cards.map(({ key, label, icon: Icon, format, color }) => {
      const value = key === 'totalDocuments' && documentCount !== undefined
        ? documentCount
        : (stats as any)[key] || 0;
      const isClickable = key === 'totalDocuments' && onDocumentsClick;
      const card = (
        <div className="flex items-center gap-2 sm:gap-3">
          <Icon className={`w-6 h-6 sm:w-8 sm:h-8 ${color}`} />
          <div>
            <p className="text-lg sm:text-2xl font-bold text-white">{format(value)}</p>
            <p className="text-xs text-slate-400">{label}</p>
          </div>
        </div>
        );
        return (
          <Card key={key}>
            {isClickable ? (
              <button
                onClick={onDocumentsClick}
                className="w-full text-left cursor-pointer hover:opacity-80 transition-opacity"
              >
                {card}
              </button>
            ) : (
              card
            )}
          </Card>
        );
      })}
    </div>
  );
}
