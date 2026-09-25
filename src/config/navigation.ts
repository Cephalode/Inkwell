import { IconType } from 'react-icons';
import {
  HiRocketLaunch,
  HiDocumentText,
  HiShare,
  HiBookOpen,
  HiAcademicCap,
  HiClipboardDocumentList,
  HiRectangleStack,
  HiSparkles,
  HiQuestionMarkCircle,
  HiGlobeAlt,
  HiCog,
} from 'react-icons/hi2';
import { HOME } from './home';

export interface NavItem {
  path: string; // route path, e.g. '/documents'
  label: string; // display label, e.g. 'Documents'
  icon: IconType; // icon component
}

// Primary nav items (shown in sidebar and mobile drawer, in render order).
// The dashboard is gone — home IS the roadmap now.
export const NAV_ITEMS: NavItem[] = [
  { path: HOME, label: 'Learn', icon: HiRocketLaunch },
  { path: '/documents', label: 'Documents', icon: HiDocumentText },
  { path: '/topic-map', label: 'Topic map', icon: HiShare },
  { path: '/textbook', label: 'Textbook', icon: HiBookOpen },
  { path: '/courses', label: 'Courses', icon: HiAcademicCap },
  { path: '/study-guides', label: 'Study Guides', icon: HiClipboardDocumentList },
  { path: '/flashcards', label: 'Flashcards', icon: HiRectangleStack },
  { path: '/lessons', label: 'Lessons', icon: HiSparkles },
  { path: '/tests', label: 'Tests', icon: HiQuestionMarkCircle },
  { path: '/coursera', label: 'Coursera', icon: HiGlobeAlt },
  { path: '/settings', label: 'Settings', icon: HiCog },
];

// Map for MobileHeader page titles (path → title)
export const PATH_TITLES: Record<string, string> = Object.fromEntries(
  NAV_ITEMS.map((item) => [item.path, item.label])
);
