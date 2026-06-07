import { useState } from 'react';
import PracticeExam from '../components/exam/PracticeExam';
import Card from '../components/shared/Card';
import EmptyState from '../components/shared/EmptyState';
import { useDocumentStore } from '../store/documentStore';
import { useProgress } from '../hooks/useProgress';
import { generateUUID } from '../utils/uuid';

export default function ExamPage() {
  const documents = useDocumentStore((s) => s.documents);
  const { trackSession } = useProgress();
  const [selectedDoc, setSelectedDoc] = useState('');
  const doc = documents.find((d) => d.id === selectedDoc);

  const handleExamComplete = (result: { score: number; totalPoints: number; questionCount: number; duration: number }) => {
    const scorePercent = result.totalPoints > 0 ? Math.round((result.score / result.totalPoints) * 100) : 0;
    trackSession({
      id: generateUUID(),
      type: 'exam',
      documentId: doc?.id,
      duration: result.duration,
      date: Date.now(),
      score: scorePercent,
      metadata: { questionCount: result.questionCount, totalPoints: result.totalPoints },
    });
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white mb-1">📋 Practice Exam</h1>
        <p className="text-slate-400">Generate and take practice exams from your study materials</p>
      </div>

      {!doc ? (
        <div>
          <label className="block text-sm text-slate-400 mb-2">Select study material:</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {documents.map((d) => (
              <Card key={d.id} onClick={() => setSelectedDoc(d.id)} className="hover:scale-[1.02] transition-transform cursor-pointer">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{d.type === 'pdf' ? '📄' : '📝'}</span>
                  <div>
                    <p className="text-sm font-semibold text-slate-200">{d.name}</p>
                    <p className="text-xs text-slate-500">{(d.parsedText?.length || 0).toLocaleString()} chars</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
          {documents.length === 0 && (
            <EmptyState icon="📋" title="No documents yet" description="Upload study materials first to generate practice exams" />
          )}
        </div>
      ) : (
        <PracticeExam documentText={doc.parsedText || ''} documentName={doc.name} documentId={doc.id} onComplete={handleExamComplete} />
      )}
    </div>
  );
}
