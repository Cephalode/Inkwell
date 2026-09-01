import { IconType } from 'react-icons';
import {
  HiHome,
  HiDocumentText,
  HiBookOpen,
  HiAcademicCap,
  HiClipboardDocumentList,
  HiRectangleStack,
  HiQuestionMarkCircle,
  HiGlobeAlt,
  HiCog,
  HiPencilSquare,
  HiCalendarDays,
} from 'react-icons/hi2';

export interface NavItem {
  path: string; // route path, e.g. '/documents'
  label: string; // display label, e.g. 'Documents'
  icon: IconType; // icon component
}

// Primary nav items (shown in sidebar and mobile drawer, in render order)
export const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: HiHome },
  { path: '/documents', label: 'Documents', icon: HiDocumentText },
  { path: '/textbook', label: 'Textbook', icon: HiBookOpen },
  { path: '/courses', label: 'Courses', icon: HiAcademicCap },
  { path: '/study-guides', label: 'Study Guides', icon: HiClipboardDocumentList },
  { path: '/flashcards', label: 'Flashcards', icon: HiRectangleStack },
  { path: '/deadlines', label: 'Deadlines', icon: HiCalendarDays },
  { path: '/notes', label: 'Notes', icon: HiPencilSquare },
  { path: '/tests', label: 'Tests', icon: HiQuestionMarkCircle },
  { path: '/coursera', label: 'Coursera', icon: HiGlobeAlt },
  { path: '/settings', label: 'Settings', icon: HiCog },
];

// Map for MobileHeader page titles (path → title)
export const PATH_TITLES: Record<string, string> = Object.fromEntries(
  NAV_ITEMS.map((item) => [item.path, item.label])
);
