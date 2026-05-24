import { useState } from 'react';
import { HiClipboardCheck, HiCheckCircle, HiXCircle } from 'react-icons/hi';
import Button from '../shared/Button';
import Card from '../shared/Card';
import Badge from '../shared/Badge';
import Spinner from '../shared/Spinner';
import { chatCompletion } from '../../services/ai/client';

interface ExamQuestion {
  id: number;
  type: 'mcq' | 'true_false' | 'short_answer';
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
  points: number;
}

interface ExamResult {
  score: number;
  total: number;
  feedback: string[];
}

interface PracticeExamProps {
  documentText: string;
  documentName: string;
}

export default function PracticeExam({ documentText, documentName }: PracticeExamProps) {
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<ExamResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [questionCount, setQuestionCount] = useState(10);
  const [difficulty, setDifficulty] = useState('mixed');

  const generateExam = async () => {
    setIsLoading(true);
    try {
      const prompt = 'Create a practice exam from this study material.\n'
        + 'Generate ' + questionCount + ' questions of varying types (MCQ, true/false, short answer).\n'
        + 'Difficulty: ' + difficulty + '.\n\n'
        + 'Return JSON:\n'
        + '{"questions": [{"id": 1, "type": "mcq", "question": "...", "options": ["A) ...", "B) ...", "C) ...", "D) ..."], "correctAnswer": "A) ...", "explanation": "...", "points": 2}]}\n\n'
        + 'Material:\n---\n'
        + documentText.slice(0, 8000);

      const response = await chatCompletion([{ role: 'user', content: prompt }]);
      const jsonStr = response.match(/\{[\s\S]*\}/)?.[0] || '{}';
      const parsed = JSON.parse(jsonStr);
      setQuestions(parsed.questions || []);
      setAnswers({});
      setSubmitted(false);
      setResult(null);
    } catch { /* handle */ }
    setIsLoading(false);
  };

  const submitExam = () => {
    let score = 0;
    const feedback: string[] = [];
    const total = questions.reduce((sum, q) => sum + q.points, 0);

    questions.forEach((q) => {
      const userAnswer = answers[q.id] || '';
      if (userAnswer.toLowerCase().trim() === q.correctAnswer.toLowerCase().trim()) {
        score += q.points;
        feedback.push('✅ Q' + q.id + ': Correct! ' + q.explanation);
      } else {
        feedback.push('❌ Q' + q.id + ': Wrong. Your answer: "' + userAnswer + '". Correct: "' + q.correctAnswer + '". ' + q.explanation);
      }
    });

    setResult({ score, total, feedback });
    setSubmitted(true);
  };

  const scorePercent = result ? Math.round((result.score / result.total) * 100) : 0;
  const answeredCount = Object.keys(answers).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <HiClipboardCheck className="w-6 h-6 text-cyan-400" />
        <div>
          <h3 className="text-lg font-bold text-white">Practice Exam</h3>
          <p className="text-xs text-slate-400">{documentName}</p>
        </div>
      </div>

      {questions.length === 0 ? (
        <Card className="text-center py-8">
          <div className="flex items-center justify-center gap-4 mb-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Questions</label>
              <select value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value))} className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-200">
                <option value={5}>5</option><option value={10}>10</option><option value={15}>15</option><option value={20}>20</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Difficulty</label>
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-200">
                <option value="easy">Easy</option><option value="mixed">Mixed</option><option value="hard">Hard</option>
              </select>
            </div>
          </div>
          <Button onClick={generateExam} isLoading={isLoading}>
            <HiClipboardCheck className="w-5 h-5" /> Generate Practice Exam
          </Button>
        </Card>
      ) : (
        <>
          {submitted && result && (
            <Card className={"border-2 " + (scorePercent >= 70 ? "border-green-500/50" : scorePercent >= 50 ? "border-yellow-500/50" : "border-red-500/50")}>
              <div className="text-center">
                <div className={"text-4xl font-bold mb-1 " + (scorePercent >= 70 ? "text-green-400" : scorePercent >= 50 ? "text-yellow-400" : "text-red-400")}>
                  {scorePercent}%
                </div>
                <p className="text-sm text-slate-400">{result.score}/{result.total} points</p>
              </div>
            </Card>
          )}

          <div className="space-y-4">
            {questions.map((q) => {
              const isCorrect = submitted && answers[q.id]?.toLowerCase().trim() === q.correctAnswer.toLowerCase().trim();
              return (
                <Card key={q.id} className={submitted ? (isCorrect ? "border-green-500/30" : "border-red-500/30") : ""}>
                  <div className="flex items-start gap-2">
                    <Badge color="gray" className="shrink-0">{"Q" + q.id}</Badge>
                    <Badge color={q.type === "mcq" ? "cyan" : q.type === "true_false" ? "teal" : "yellow"} className="shrink-0">
                      {q.type.replace("_", " ")}
                    </Badge>
                    <span className="text-sm text-slate-200 ml-2">{q.question}</span>
                  </div>

                  {q.type === "mcq" && q.options ? (
                    <div className="mt-3 space-y-2">
                      {q.options.map((opt) => {
                        const isSelected = answers[q.id] === opt;
                        const isRight = opt === q.correctAnswer;
                        let cls = "flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors border ";
                        if (submitted && isRight) cls += "bg-green-600/20 border-green-500/40";
                        else if (submitted && isSelected && !isRight) cls += "bg-red-600/20 border-red-500/40";
                        else if (isSelected) cls += "bg-cyan-600/20 border-cyan-500/40";
                        else cls += "bg-slate-700/40 border-transparent";
                        return (
                          <label key={opt} className={cls}>
                            <input type="radio" name={"q" + q.id} checked={isSelected}
                              onChange={() => !submitted && setAnswers({ ...answers, [q.id]: opt })} disabled={submitted} className="accent-cyan-500" />
                            <span className="text-sm text-slate-200">{opt}</span>
                            {submitted && isRight && <HiCheckCircle className="w-4 h-4 text-green-400 ml-auto" />}
                            {submitted && isSelected && !isRight && <HiXCircle className="w-4 h-4 text-red-400 ml-auto" />}
                          </label>
                        );
                      })}
                    </div>
                  ) : q.type === "true_false" ? (
                    <div className="mt-3 flex gap-2">
                      {["True", "False"].map((opt) => {
                        const isSelected = answers[q.id] === opt;
                        const isRight = opt === q.correctAnswer;
                        let cls = "flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer transition-colors border ";
                        if (submitted && isRight) cls += "bg-green-600/20 border-green-500/40";
                        else if (isSelected) cls += "bg-cyan-600/20 border-cyan-500/40";
                        else cls += "bg-slate-700/40 border-transparent";
                        return (
                          <label key={opt} className={cls}>
                            <input type="radio" name={"q" + q.id} checked={isSelected}
                              onChange={() => !submitted && setAnswers({ ...answers, [q.id]: opt })} disabled={submitted} />
                            <span className="text-sm text-slate-200">{opt}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <textarea value={answers[q.id] || ""} onChange={(e) => !submitted && setAnswers({ ...answers, [q.id]: e.target.value })}
                      disabled={submitted} placeholder="Type your answer..."
                      className="mt-3 w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-200 placeholder-slate-500" rows={2} />
                  )}

                  {submitted && (
                    <div className="mt-3 p-2 rounded-lg bg-slate-800/50 text-xs text-slate-300">
                      <strong className="text-cyan-400">Explanation:</strong> {q.explanation}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          <div className="flex justify-center gap-4">
            {!submitted ? (
              <>
                <Button onClick={submitExam} disabled={answeredCount < questions.length}>
                  <HiClipboardCheck className="w-4 h-4" /> Submit Exam
                </Button>
                <span className="text-xs text-slate-500 self-center">
                  {answeredCount}/{questions.length} answered
                </span>
              </>
            ) : (
              <Button onClick={() => { setQuestions([]); setAnswers({}); setSubmitted(false); setResult(null); }}>
                Generate New Exam
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
