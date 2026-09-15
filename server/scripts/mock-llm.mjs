// Mock GLM chat-completions server for offline development and testing.
//
// Keyword-routes each prompt the learning suite sends (topic extraction,
// roadmap synthesis, lesson / quiz / flashcards / discussion / teach-back
// generation and grading) to canned JSON so the whole flow can be exercised
// without API quota.
//
//   node server/scripts/mock-llm.mjs                      # listens on :3999
//   GLM_UPSTREAM=http://localhost:3999/v1/chat/completions npm run dev:backend
import http from 'node:http';

const reply = (obj) => JSON.stringify({ choices: [{ message: { content: JSON.stringify(obj) } }] });

function topicsFor(title) {
  const t = title.toLowerCase();
  if (t.includes('deep')) return ['Neural networks', 'Gradient descent', 'Backpropagation', 'Convolutional networks'];
  if (t.includes('unsupervised') || t.includes('cluster')) return ['K-means clustering', 'Principal component analysis', 'Gradient descent'];
  return ['Linear regression', 'Gradient descent', 'Overfitting and regularization', 'Logistic regression', 'Model evaluation'];
}

function route(messages) {
  const sys = messages.find((m) => m.role === 'system')?.content ?? '';
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const u = lastUser;

  if (u.includes('List the 2-8 distinct topics')) {
    const title = (u.match(/Material title: (.*)/) ?? [])[1] ?? '';
    return {
      topics: topicsFor(title).map((name) => ({
        name,
        description: `${name} as taught in ${title || 'the material'}.`,
        objectives: [`Explain ${name.toLowerCase()} in plain words`, `Apply ${name.toLowerCase()} to a small example`, `Recognise when ${name.toLowerCase()} is appropriate`],
        keyPoints: [`${name}: definition`, `${name}: intuition`, `${name}: a worked example`, `${name}: common pitfalls`],
      })),
    };
  }
  if (u.includes('Build the roadmap')) {
    const m = u.match(/\(index = material number\):\n(\[[\s\S]*?\])\n/);
    let extracted = [];
    try { extracted = JSON.parse(m[1]); } catch {}
    const seen = new Map();
    extracted.forEach((t) => { if (!seen.has(t.name)) seen.set(t.name, { ...t, idx: [t.i] }); else seen.get(t.name).idx.push(t.i); });
    const list = [...seen.values()];
    return {
      title: 'Mock roadmap',
      overview: 'A mock learning path generated offline for testing.',
      steps: list.map((t, i) => ({
        title: t.name, description: t.description, objectives: t.objectives, keyPoints: t.keyPoints,
        dependsOn: i > 0 ? [list[i - 1].name] : [], sources: t.idx, estimatedMinutes: 15 + i * 5,
      })),
    };
  }
  if (u.includes('Write a lesson')) {
    return { markdown: '# Lesson\n\n**Why it matters.** Mock lesson body with an example.\n\n- recap one\n- recap two', checkpoints: [{ question: 'Q1?', answer: 'A1' }, { question: 'Q2?', answer: 'A2' }, { question: 'Q3?', answer: 'A3' }], estimatedMinutes: 6 };
  }
  if (u.includes('quiz questions')) {
    return { questions: [
      { qtype: 'mcq', prompt: 'Which statement is true?', options: ['Alpha', 'Beta', 'Gamma', 'Delta'], correctAnswer: 'Beta', explanation: 'Beta is right.', objective: 'obj 1' },
      { qtype: 'mcq', prompt: 'Pick the right one', options: ['One', 'Two', 'Three', 'Four'], correctAnswer: 'B', explanation: 'Letter mapped.', objective: 'obj 1' },
      { qtype: 'true_false', prompt: 'The sky is blue.', correctAnswer: true, explanation: 'Yes.', objective: 'obj 2' },
      { qtype: 'true_false', prompt: 'Two plus two is five.', correctAnswer: 'false', explanation: 'No.', objective: 'obj 2' },
      { qtype: 'short_answer', prompt: 'Explain the core idea.', correctAnswer: 'The core idea is X.', explanation: '', objective: 'obj 3' },
      { qtype: 'mcq', prompt: 'And this one?', options: ['Yes', 'No'], correctAnswer: 'Yes', explanation: '', objective: 'obj 3' },
    ] };
  }
  if (u.includes('Grade this short answer')) return { points: 1, feedback: 'Spot on.' };
  if (u.includes('flashcards for this topic')) {
    return { cards: Array.from({ length: 8 }, (_, i) => ({ front: `Front ${i + 1}?`, back: `Back ${i + 1}.` })) };
  }
  if (u.includes('The session is starting')) {
    return { reply: 'Welcome! In your own words, what is the core idea here?', assessment: { verdict: 'progressing', confidence: 0.2, coveredObjectives: [], gaps: [] }, done: false };
  }
  if (sys.includes('Socratic discussion')) {
    const closing = u.includes('turn limit reached');
    const good = u.toLowerCase().includes('minimise') || u.toLowerCase().includes('minimize') || u.toLowerCase().includes('correct');
    if (good || closing) return { reply: 'Exactly right — you have got it. Summary: solid understanding.', assessment: { verdict: 'learned', confidence: 0.9, coveredObjectives: ['obj 1', 'obj 2'], gaps: [] }, done: true };
    return { reply: 'Hmm, not quite. Hint: think about what the algorithm minimises. Try again?', assessment: { verdict: 'progressing', confidence: 0.45, coveredObjectives: ['obj 1'], gaps: ['obj 2'] }, done: false };
  }
  if (u.includes('"teach it back" exercise')) {
    return { prompt: 'Explain this topic to a classmate. Cover the definition, why it matters, and an example.', rubric: ['Definition', 'Why it matters', 'Example', 'Pitfall'], hints: ['Start with the definition', 'Use a concrete example'] };
  }
  if (u.includes("Grade a learner's teach-back")) return { score: 0.85, covered: ['Definition', 'Example'], missing: ['Pitfall'], feedback: 'Good explanation; mention a pitfall next time.' };
  if (u.includes('Write 4 YouTube search queries')) {
    const target = (u.match(/Target topic: (.*)/) ?? [])[1] ?? 'topic';
    const neighbour = (u.match(/right after this one[^\n]*\n- (.*)/) ?? [])[1];
    return { queries: [
      { q: `${target} explained intuition`, intent: 'precise' },
      { q: `${target} tutorial`, intent: 'precise' },
      { q: `${target} lecture`, intent: 'lecture' },
      neighbour ? { q: `${target} ${neighbour}`, intent: 'combo' } : { q: `${target} worked example`, intent: 'lecture' },
    ] };
  }
  if (u.includes('Milestones to check:')) {
    const title = ((u.match(/Video: "(.*)" — channel/) ?? [])[1] ?? '').toLowerCase();
    const transcript = (u.split('Transcript sample')[1] ?? '').toLowerCase();
    const skills = [...u.matchAll(/skillId (\S+) — (.*)/g)].map((m) => ({ id: m[1], label: m[2].trim() }));
    const out = skills.map((s) => {
      const words = s.label.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      const inTitle = words.filter((w) => title.includes(w)).length / Math.max(1, words.length);
      const inText = words.filter((w) => transcript.includes(w)).length / Math.max(1, words.length);
      const coverage = Math.max(inTitle * 0.95, inText * 0.6);
      return { skillId: s.id, coverage: Math.round(coverage * 100) / 100, confidence: transcript ? 0.8 : 0.4,
        objectivesCovered: coverage > 0.5 ? ['objective 1'] : [], startMinute: coverage > 0.3 ? 1 : null, endMinute: coverage > 0.3 ? 8 : null,
        reason: coverage > 0.5 ? 'title and transcript match' : 'not really covered' };
    });
    return { summary: `Mock summary for "${title}".`, level: 'intro', focus: 0.8, quality: 0.7, skills: out };
  }
  if (u.includes('title generator') || sys.includes('title generator')) return 'Mock title';
  return { ok: true };
}

http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    let messages = [];
    try { messages = JSON.parse(body).messages ?? []; } catch {}
    const out = route(messages);
    res.setHeader('Content-Type', 'application/json');
    res.end(typeof out === 'string' ? JSON.stringify({ choices: [{ message: { content: out } }] }) : reply(out));
  });
}).listen(3999, () => console.log('mock llm on 3999'));
