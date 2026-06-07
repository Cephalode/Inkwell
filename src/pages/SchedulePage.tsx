import StudyScheduler from '../components/scheduler/StudyScheduler';

export default function SchedulePage() {
  return (
    <div className="space-y-4 sm:space-y-6 overflow-x-auto">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white mb-1">📅 Study Schedule</h1>
        <p className="text-slate-400">Plan study sessions with spaced repetition reminders</p>
      </div>
      <StudyScheduler />
    </div>
  );
}
