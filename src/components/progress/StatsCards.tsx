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
}

const cards = [
  { key: 'totalStudyTime', label: 'Study Time', icon: HiClock, format: (v: number) => formatSeconds(v), color: 'text-cyan-400' },
  { key: 'totalDocuments', label: 'Documents', icon: HiDocumentText, format: (v: number) => v.toString(), color: 'text-teal-400' },
  { key: 'flashcardsReviewed', label: 'Cards Reviewed', icon: HiAcademicCap, format: (v: number) => v.toString(), color: 'text-green-400' },
  { key: 'currentStreak', label: 'Day Streak', icon: HiFire, format: (v: number) => `${v} days`, color: 'text-orange-400' },
];

export default function StatsCards({ stats }: StatsCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(({ key, label, icon: Icon, format, color }) => (
        <Card key={key}>
          <div className="flex items-center gap-3">
            <Icon className={`w-8 h-8 ${color}`} />
            <div>
              <p className="text-2xl font-bold text-white">{format((stats as any)[key] || 0)}</p>
              <p className="text-xs text-slate-400">{label}</p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
