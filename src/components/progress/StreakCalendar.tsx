import { StudySession } from '../../types/progress';

interface StreakCalendarProps {
  sessions: StudySession[];
}

export default function StreakCalendar({ sessions }: StreakCalendarProps) {
  const days: Record<string, number> = {};
  sessions.forEach((s) => {
    const date = new Date(s.date).toISOString().split('T')[0];
    days[date] = (days[date] || 0) + s.duration;
  });

  const last30 = Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    const key = d.toISOString().split('T')[0];
    const mins = Math.round((days[key] || 0) / 60);
    return { date: key, mins };
  });

  const getColor = (mins: number) => {
    if (mins === 0) return 'bg-slate-800';
    if (mins < 15) return 'bg-cyan-900';
    if (mins < 30) return 'bg-cyan-700';
    if (mins < 60) return 'bg-cyan-500';
    return 'bg-cyan-400';
  };

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
      <h4 className="text-sm font-semibold text-slate-200 mb-3">Study Activity (Last 30 Days)</h4>
      <div className="flex gap-1 flex-wrap">
        {last30.map((d) => (
          <div
            key={d.date}
            className={`w-5 h-5 rounded-sm ${getColor(d.mins)} transition-colors`}
            title={`${d.date}: ${d.mins} min`}
          />
        ))}
      </div>
      <div className="flex items-center gap-2 mt-3 text-xs text-slate-500">
        <span>Less</span>
        <div className="w-3 h-3 rounded-sm bg-slate-800" />
        <div className="w-3 h-3 rounded-sm bg-cyan-900" />
        <div className="w-3 h-3 rounded-sm bg-cyan-700" />
        <div className="w-3 h-3 rounded-sm bg-cyan-500" />
        <div className="w-3 h-3 rounded-sm bg-cyan-400" />
        <span>More</span>
      </div>
    </div>
  );
}
