import { usePomodoro } from '../../hooks/usePomodoro';
import Button from '../shared/Button';
import { formatTimerDisplay } from '../../utils/formatTime';
import { HiPlay, HiPause, HiRefresh } from 'react-icons/hi';

export default function PomodoroTimer() {
  const { isRunning, phase, timeRemaining, sessionsCompleted, start, pause, reset, startWork } = usePomodoro();

  const phaseColors = { work: 'text-cyan-400', break: 'text-green-400', longBreak: 'text-purple-400' };
  const phaseLabels = { work: 'Focus Time', break: 'Short Break', longBreak: 'Long Break' };

  return (
    <div className="flex flex-col items-center justify-center py-10">
      <div className="relative w-64 h-64 mb-8">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" className="text-slate-700" strokeWidth="4" />
          <circle
            cx="50" cy="50" r="45" fill="none"
            stroke="currentColor" className={phaseColors[phase]}
            strokeWidth="4" strokeLinecap="round"
            strokeDasharray={`${(timeRemaining / (phase === 'work' ? 25 * 60 : phase === 'break' ? 5 * 60 : 15 * 60)) * 283} 283`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-4xl font-mono font-bold ${phaseColors[phase]}`}>
            {formatTimerDisplay(timeRemaining)}
          </span>
          <span className="text-sm text-slate-400 mt-2">{phaseLabels[phase]}</span>
        </div>
      </div>
      <div className="flex gap-3 mb-6">
        {!isRunning ? (
          <Button onClick={start}><HiPlay className="w-5 h-5" />Start</Button>
        ) : (
          <Button variant="secondary" onClick={pause}><HiPause className="w-5 h-5" />Pause</Button>
        )}
        <Button variant="ghost" onClick={reset}><HiRefresh className="w-5 h-5" />Reset</Button>
      </div>
      <div className="text-sm text-slate-400">
        Sessions completed: <span className="text-cyan-400 font-semibold">{sessionsCompleted}</span>
      </div>
    </div>
  );
}
