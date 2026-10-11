/**
 * Post-watch comprehension check.
 *
 * When a video is marked watched the learner must first answer two questions
 * about it. Questions are generated once per video by the LLM from the
 * transcript + summary + the milestones the video was judged against, and
 * cached in `videos.watch_quiz`. Generation is best-effort: if the LLM fails,
 * a deterministic fallback quiz is built from the top milestone's coverage
 * data so the gate never hard-blocks the watch flow.
 *
 * Shipped over the wire WITHOUT the correct answers — grading happens
 * server-side in POST /videos/:id/watched.
 */

import pool from '../db.js';
import { callGLMJson } from './llm.js';
import type { RankedVideo } from './videoSearch.js';

export interface WatchQuizQuestion {
  question: string;
  options: string[];
  /** Index into options. Server-only — strip before responding. */
  answerIndex: number;
}

export interface WatchQuiz {
  questions: WatchQuizQuestion[];
  generatedAt: string;
}

const shuffle = <T,>(items: T[]): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/** Options with the correct answer placed at a random index; returns them plus that index. */
function withShuffledAnswer(correct: string, distractors: string[]): { options: string[]; answerIndex: number } {
  const options = shuffle([correct, ...distractors]);
  return { options, answerIndex: options.indexOf(correct) };
}

/** Fallback when the LLM fails: two check questions from the judged milestones. */
function fallbackQuiz(video: RankedVideo): WatchQuiz {
  const ranked = [...video.milestones].sort((a, b) => b.coverage - a.coverage);
  const top = ranked[0];
  const objective = top?.objectivesCovered[0] ?? (top ? `the key ideas of ${top.label}` : 'the video');
  const q1 = withShuffledAnswer(`It teaches ${objective}`, [
    'It only mentions the topic without teaching it',
    'It is about a different topic entirely',
    `It teaches ${objective} but incorrectly`,
  ]);
  const q2 = withShuffledAnswer('Reassess the milestone with a quiz or recall activity', [
    'Nothing — watching a video fully masters a topic',
    'Watch five more videos on the same exact topic',
    'Rewatch the video three more times in a row',
  ]);
  return {
    questions: [
      {
        question: top ? `Which statement best describes the video "${video.title.slice(0, 80)}"?` : 'Which statement best describes this video?',
        options: q1.options,
        answerIndex: q1.answerIndex,
      },
      {
        question: 'What is the most effective next step after watching it?',
        options: q2.options,
        answerIndex: q2.answerIndex,
      },
    ],
    generatedAt: new Date().toISOString(),
  };
}

function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : String(x ?? ''))).filter(Boolean) : [];
}

interface QuizSource {
  title: string;
  summary: string;
  transcriptStatus: string;
  transcriptExcerpt: string;
  milestones: RankedVideo['milestones'];
}

async function generateQuiz(v: QuizSource): Promise<WatchQuiz> {
  const transcriptNote =
    v.transcriptStatus === 'ok'
      ? 'The transcript excerpt is a start/middle/end sample of the captions.'
      : 'No transcript is available — write questions from the summary only.';
  const milestonesBlock = v.milestones
    .slice(0, 5)
    .map((m) => `- ${m.label} (covered objectives: ${m.objectivesCovered.join(' | ') || 'n/a'})`)
    .join('\n');
  const out = await callGLMJson<{ questions?: Array<{ question?: unknown; options?: unknown; answerIndex?: unknown }> }>(
    [
      {
        role: 'system',
        content:
          'You write short comprehension checks for educational videos. Questions must be answerable from the video itself, have exactly one clearly correct option, and use plain language.',
      },
      {
        role: 'user',
        content: `Video: "${v.title}"
Summary of what it teaches: ${v.summary || '(none)'}
${transcriptNote}
Milestones this video was matched to:
${milestonesBlock || '- (none)'}

Transcript excerpt:
${v.transcriptExcerpt || '(none)'}

Write exactly 2 multiple-choice questions (4 options each) that check the viewer understood the video's core content. Exactly one option per question is correct.

Respond with ONLY JSON: {"questions": [{"question": "...", "options": ["...", "...", "...", "..."], "answerIndex": 0}]}`,
      },
    ],
    { temperature: 0.3, maxTokens: 1200, withReasoning: true },
  );
  const raw = Array.isArray(out?.questions) ? out!.questions : [];
  const questions: WatchQuizQuestion[] = [];
  for (const q of raw) {
    const options = strArr(q.options);
    const idx = Number(q.answerIndex);
    if (typeof q.question !== 'string' || !q.question.trim()) continue;
    if (options.length < 2 || options.length > 6) continue;
    if (!Number.isInteger(idx) || idx < 0 || idx >= options.length) continue;
    questions.push({ question: q.question.trim(), options, answerIndex: idx });
    if (questions.length === 2) break;
  }
  if (questions.length < 2) throw new Error('Quiz generation returned fewer than 2 valid questions');
  return { questions: questions.slice(0, 2), generatedAt: new Date().toISOString() };
}

/** Public shape — no correct answers. */
export type PublicWatchQuiz = Array<{ question: string; options: string[] }>;

export function stripAnswers(quiz: WatchQuiz): PublicWatchQuiz {
  return quiz.questions.map((q) => ({ question: q.question, options: q.options }));
}

/**
 * The quiz for a video — cached in `videos.watch_quiz`, generated on first
 * request. Throws only on DB errors; LLM failure falls back to the
 * deterministic quiz so the gate never hard-blocks.
 */
export async function getWatchQuiz(video: RankedVideo): Promise<WatchQuiz> {
  const { rows } = await pool.query('SELECT watch_quiz, transcript FROM videos WHERE id = $1', [video.id]);
  const row = rows[0] as { watch_quiz: WatchQuiz | null; transcript: string | null } | undefined;
  const cached = row?.watch_quiz ?? null;
  if (cached?.questions?.length) return cached;
  const source: QuizSource = {
    title: video.title,
    summary: video.summary,
    transcriptStatus: video.transcriptStatus,
    transcriptExcerpt: (row?.transcript ?? '').slice(0, 1200),
    milestones: video.milestones,
  };
  const generated = await generateQuiz(source).catch(() => fallbackQuiz(video));
  await pool.query('UPDATE videos SET watch_quiz = $1::jsonb, updated_at = now() WHERE id = $2', [
    JSON.stringify(generated),
    video.id,
  ]);
  return generated;
}

/** Grade answers ("0".."3" strings from the UI). Returns per-question correctness. */
export function gradeQuiz(quiz: WatchQuiz, answers: string[]): boolean[] {
  return quiz.questions.map((q, i) => String(answers[i] ?? '') === String(q.answerIndex));
}
