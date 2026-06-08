import Card from '../components/shared/Card';
import { HiDocumentAdd, HiBookOpen } from 'react-icons/hi';
import { useNavigate } from 'react-router-dom';
import { useDocumentStore } from '../store/documentStore';

export default function DashboardPage() {
  const navigate = useNavigate();
  const documents = useDocumentStore((s) => s.documents);

  const quickActions = [
    { icon: HiDocumentAdd, label: 'Upload Files', color: 'cyan', to: '/documents' },
    { icon: HiBookOpen, label: 'Textbook Study', color: 'yellow', to: '/textbook' },
  ];

  const colorMap: Record<string, string> = {
    cyan: 'hover:border-cyan-500/50 text-cyan-400',
    teal: 'hover:border-teal-500/50 text-teal-400',
    green: 'hover:border-green-500/50 text-green-400',
    yellow: 'hover:border-yellow-500/50 text-yellow-400',
  };

  return (
  <div className="space-y-4 sm:space-y-6">
    <div>
      <h1 className="text-xl sm:text-2xl font-bold text-white mb-1">Welcome to Inkwell 🧠</h1>
      <p className="text-sm sm:text-base text-slate-400">Your AI-powered study companion — upload materials and learn smarter</p>
    </div>

    <Card header={<h3 className="text-white font-semibold">⚡ Quick Actions</h3>}>
      <div className="grid grid-cols-2 gap-3">
        {quickActions.map(({ icon: Icon, label, color, to }) => (
          <button
            key={to}
            onClick={() => navigate(to)}
            className={"flex items-center gap-3 p-3 rounded-xl bg-slate-700/50 hover:bg-slate-700 border border-slate-600 transition-all " + (colorMap[color] || '')}
          >
            <Icon className="w-5 h-5 shrink-0" />
            <span className="text-sm text-slate-200">{label}</span>
          </button>
        ))}
      </div>
    </Card>

    {documents.length > 0 && (
      <Card header={<h3 className="text-white font-semibold">📚 Recent Documents</h3>}>
        <div className="space-y-2">
          {documents.slice(0, 5).map((doc) => (
            <button
              key={doc.id}
              onClick={() => navigate(`/documents/${doc.id}`)}
              className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-slate-700/50 transition-colors text-left"
            >
              <span className="text-xl">{doc.type === 'pdf' ? '📄' : doc.type === 'pptx' ? '📊' : '📝'}</span>
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
