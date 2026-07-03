export default function LoadingScreen() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950">
      <div className="relative mb-6">
        <div className="w-16 h-16 rounded-full border-4 border-slate-700 border-t-cyan-400 animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <svg className="w-6 h-6 text-cyan-400" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 9h12v2c0 1-.8 1.8-1.8 2l-.2 4c-.1 1.5-1.3 2.5-2.8 2.5H10.8c-1.5 0-2.7-1-2.8-2.5l-.2-4C6.8 12.8 6 12 6 11V9z" fill="currentColor" opacity="0.15" />
            <path d="M6 9h12v2c0 1-.8 1.8-1.8 2l-.2 4c-.1 1.5-1.3 2.5-2.8 2.5H10.8c-1.5 0-2.7-1-2.8-2.5l-.2-4C6.8 12.8 6 12 6 11V9z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M8 9V7.5c0-.3.2-.5.5-.5h7c.3 0 .5.2.5.5V9" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <ellipse cx="12" cy="10.5" rx="4.5" ry="1" fill="currentColor" opacity="0.4" />
            <path d="M15.5 3.5c.7-.3 1.5.1 1.5.9L16.5 8l-3.5 1.5L15.5 3.5z" fill="currentColor" opacity="0.2" />
            <path d="M15.5 3.5c.7-.3 1.5.1 1.5.9L16.5 8l-3.5 1.5L15.5 3.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            <line x1="16.5" y1="8" x2="18" y2="3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <path d="M13 9.5l-.5 1.5 1.5-.5" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
      <h2 className="text-lg font-semibold text-white mb-1">Inkwell</h2>
      <p className="text-sm text-slate-400">Loading your study space...</p>
    </div>
  );
}
