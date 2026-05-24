import StatsCards from '../components/progress/StatsCards';
import StreakCalendar from '../components/progress/StreakCalendar';
import Card from '../components/shared/Card';
import Button from '../components/shared/Button';
import { HiDocumentAdd, HiAcademicCap, HiQuestionMarkCircle, HiBookOpen } from 'react-icons/hi';
import { useNavigate } from 'react-router-dom';
import { useProgress } from '../hooks/useProgress';
import { useDocumentStore } from '../store/documentStore';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { stats, sessions } = useProgress();
  const documents = useDocumentStore((s) => s.documents);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Welcome to StudyForge 🧠</h1>
        <p className="text-slate-400">Your AI-powered study companion</p>
      </div>

      <StatsCards stats={stats} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <StreakCalendar sessions={sessions} />

        <Card header={<h3 className="text-white font-semibold">Quick Actions</h3>}>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => navigate('/documents')} className="flex items-center gap-3 p-4 rounded-xl bg-slate-700/50 hover:bg-slate-700 border border-slate-600 hover:border-cyan-500/50 transition-all">
              <HiDocumentAdd className="w-6 h-6 text-cyan-400" />
              <span className="text-sm text-slate-200">Upload Files</span>
            </button>
            <button onClick={() => navigate('/flashcards')} className="flex items-center gap-3 p-4 rounded-xl bg-slate-700/50 hover:bg-slate-700 border border-slate-600 hover:border-teal-500/50 transition-all">
              <HiAcademicCap className="w-6 h-6 text-teal-400" />
              <span className="text-sm text-slate-200">Flashcards</span>
            </button>
            <button onClick={() => navigate('/quiz')} className="flex items-center gap-3 p-4 rounded-xl bg-slate-700/50 hover:bg-slate-700 border border-slate-600 hover:border-green-500/50 transition-all">
              <HiQuestionMarkCircle className="w-6 h-6 text-green-400" />
              <span className="text-sm text-slate-200">Take Quiz</span>
            </button>
            <button onClick={() => navigate('/textbook')} className="flex items-center gap-3 p-4 rounded-xl bg-slate-700/50 hover:bg-slate-700 border border-slate-600 hover:border-purple-500/50 transition-all">
              <HiBookOpen className="w-6 h-6 text-purple-400" />
              <span className="text-sm text-slate-200">Textbook Study</span>
            </button>
          </div>
        </Card>
      </div>

      {documents.length > 0 && (
        <Card header={<h3 className="text-white font-semibold">Recent Documents</h3>}>
          <div className="space-y-2">
            {documents.slice(0, 5).map((doc) => (
              <button
                key={doc.id}
                onClick={() => navigate(`/documents/${doc.id}`)}
                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-slate-700/50 transition-colors text-left"
              >
                <span className="text-xl">{doc.type === 'pdf' ? '📄' : '📝'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200 truncate">{doc.name}</p>
                  <p className="text-xs text-slate-500">{new Date(doc.createdAt).toLocaleDateString()}</p>
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
