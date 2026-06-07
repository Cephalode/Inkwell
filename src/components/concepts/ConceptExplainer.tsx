import { useState } from 'react';
import { HiBeaker, HiSearch } from 'react-icons/hi';
import Button from '../shared/Button';
import Card from '../shared/Card';
import Spinner from '../shared/Spinner';
import { chatCompletion } from '../../services/ai/client';

interface ConceptExplainerProps {
  documentText: string;
}

interface Explanation {
  concept: string;
  explanation: string;
  analogy: string;
  related: string[];
}

export default function ConceptExplainer({ documentText }: ConceptExplainerProps) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<Explanation | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const explain = async () => {
    if (!query.trim()) return;
    setIsLoading(true);
    try {
      const prompt = `You are an expert teacher. Based on the following study material, explain the concept: "${query}"

Return a JSON object with:
{
  "concept": "the concept name",
  "explanation": "clear, detailed explanation a student can understand",
  "analogy": "a relatable real-world analogy to help remember it",
  "related": ["array of related concepts from the material"]
}

Study material:
---
${documentText.slice(0, 6000)}`;

      const response = await chatCompletion([{ role: 'user', content: prompt }]);
      const jsonStr = response.match(/\{[\s\S]*\}/)?.[0] || '{}';
      setResult(JSON.parse(jsonStr));
    } catch {
      setResult(null);
    }
    setIsLoading(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && explain()}
            placeholder="Enter a concept to explain (e.g., 'photosynthesis', 'supply and demand')..."
            className="w-full pl-10 pr-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>
        <Button onClick={explain} isLoading={isLoading}>
          <HiBeaker className="w-5 h-5" /> Explain
        </Button>
      </div>

      {isLoading && <div className="flex justify-center py-10"><Spinner /></div>}

      {result && (
        <div className="space-y-4">
          <Card>
            <h3 className="text-lg font-bold text-cyan-400 mb-3">{result.concept}</h3>
            <div className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">{result.explanation}</div>
          </Card>
          <Card header={<h4 className="text-sm font-semibold text-yellow-400">💡 Analogy</h4>}>
            <p className="text-sm text-slate-200">{result.analogy}</p>
          </Card>
          {result.related && result.related.length > 0 && (
            <Card header={<h4 className="text-sm font-semibold text-teal-400">🔗 Related Concepts</h4>}>
              <div className="flex flex-wrap gap-2">
                {result.related.map((r) => (
                  <button
                    key={r}
                    onClick={() => { setQuery(r); }}
                    className="px-3 py-1.5 rounded-full bg-teal-600/20 border border-teal-500/30 text-sm text-teal-300 hover:bg-teal-600/30 transition-colors"
                  >
                    {r}
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
