export default function LoadingScreen() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950">
      <div className="relative mb-6">
        <div className="w-16 h-16 rounded-full border-4 border-slate-700 border-t-cyan-400 animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center text-2xl">🧠</div>
      </div>
      <h2 className="text-lg font-semibold text-white mb-1">StudyForge</h2>
      <p className="text-sm text-slate-400">Loading your study space...</p>
    </div>
  );
}
