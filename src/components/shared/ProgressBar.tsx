interface ProgressBarProps {
  value: number;
  max: number;
  className?: string;
  color?: string;
}

export default function ProgressBar({ value, max, className = '', color = 'bg-cyan-500' }: ProgressBarProps) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={`w-full h-2 rounded-full bg-slate-700 ${className}`}>
      <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
