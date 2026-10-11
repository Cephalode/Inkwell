import { HiPlay, HiDocumentText, HiCode, HiChatAlt2, HiClipboard, HiAcademicCap } from 'react-icons/hi';

export const TYPE_ICON: Record<string, typeof HiPlay> = {
  lecture: HiPlay,
  supplement: HiDocumentText,
  programming: HiCode,
  gradedProgramming: HiCode,
  staffGraded: HiClipboard,
  peer: HiClipboard,
  discussionPrompt: HiChatAlt2,
  exam: HiAcademicCap,
  quiz: HiAcademicCap,
};

export const TYPE_LABEL: Record<string, string> = {
  lecture: 'Lecture',
  supplement: 'Reading',
  programming: 'Practice Lab',
  gradedProgramming: 'Graded Lab',
  staffGraded: 'Assignment',
  peer: 'Peer Review',
  discussionPrompt: 'Discussion',
  exam: 'Exam',
  quiz: 'Quiz',
};

// Which course-detail tab each item type lands in.
export const TYPE_TAB: Record<string, 'lectures' | 'labs' | 'assignments'> = {
  lecture: 'lectures',
  supplement: 'lectures',
  programming: 'labs',
  gradedProgramming: 'labs',
  staffGraded: 'assignments',
  peer: 'assignments',
  discussionPrompt: 'assignments',
  exam: 'assignments',
  quiz: 'assignments',
};
