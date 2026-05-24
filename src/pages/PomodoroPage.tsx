import PomodoroTimer from '../components/pomodoro/PomodoroTimer';
import Card from '../components/shared/Card';

export default function PomodoroPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">⏱️ Pomodoro Timer</h1>
        <p className="text-slate-400">Stay focused with timed study sessions</p>
      </div>
      <Card>
        <PomodoroTimer />
      </Card>
    </div>
  );
}
