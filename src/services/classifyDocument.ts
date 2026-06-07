import { chatCompletion } from './ai/client';

const CATEGORIES = [
  'Textbook', 'Worksheet', 'Exam', 'Quiz', 'Notes', 'Slides',
  'Reference', 'Article', 'Paper', 'Lab Manual', 'Syllabus', 'Study Guide',
  'Handout', 'Diagram', 'Code', 'Unknown',
] as const;

const SUBJECTS = [
  'Mathematics', 'Biology', 'Chemistry', 'Physics', 'Computer Science',
  'Geology', 'Seismology', 'Earth Science', 'Environmental Science',
  'History', 'Literature', 'Economics', 'Psychology', 'Philosophy',
  'Engineering', 'Medicine', 'Law', 'Linguistics', 'Art',
  'Music', 'Statistics', 'Geography', 'Political Science', 'General',
] as const;

export interface ClassifyResult {
  label: string;
  subject: string;
  confidence: number;
}

const SYSTEM_PROMPT = `You classify educational documents. Given the text below, respond with ONLY a JSON object — no explanation, no markdown fences.

{
  "label": "<one of: ${CATEGORIES.join(', ')}>",
  "subject": "<one of: ${SUBJECTS.join(', ')}>",
  "confidence": <0.0 to 1.0>
}

If the text is too short or unclear to classify, set label to "Unknown" and subject to "General".`;

export async function classifyDocument(parsedText: string): Promise<ClassifyResult> {
  const excerpt = parsedText.slice(0, 1500);
  if (!excerpt.trim()) {
    return { label: 'Unknown', subject: 'General', confidence: 0 };
  }

  const userMessage = `Classify this document:\n\n${excerpt}`;

  const raw = await chatCompletion([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ]);

  // Strip markdown fences if the model wraps the JSON
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  try {
    const parsed = JSON.parse(cleaned);
    return {
      label: CATEGORIES.includes(parsed.label) ? parsed.label : 'Unknown',
      subject: SUBJECTS.includes(parsed.subject) ? parsed.subject : 'General',
      confidence: typeof parsed.confidence === 'number'
        ? Math.min(1, Math.max(0, parsed.confidence))
        : 0.5,
    };
  } catch {
    return { label: 'Unknown', subject: 'General', confidence: 0 };
  }
}
