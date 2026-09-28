import type { ComponentType } from 'react';
import {
  HiAcademicCap,
  HiBriefcase,
  HiCalendarDays,
  HiLink,
} from 'react-icons/hi2';
import { HiChatAlt2 } from 'react-icons/hi';
import {
  SiApple,
  SiCanvas,
  SiCoursera,
  SiGithub,
  SiGooglecalendar,
  SiGoogleclassroom,
  SiGoogledrive,
  SiMoodle,
  SiNotion,
  SiSlack,
  SiTodoist,
  SiZotero,
} from 'react-icons/si';
import { HiEnvelopeOpen } from 'react-icons/hi2';
import type { IntegrationCategory, IntegrationStatus } from '../types/integration';

export interface CategoryMeta {
  label: string;
  icon: ComponentType<{ className?: string }>;
}

export const CATEGORY_META: Record<IntegrationCategory, CategoryMeta> = {
  calendar: { label: 'Calendars', icon: HiCalendarDays },
  learning: { label: 'Learning Platforms', icon: HiAcademicCap },
  communication: { label: 'Communication', icon: HiChatAlt2 },
  productivity: { label: 'Productivity', icon: HiBriefcase },
};

export const FALLBACK_ICON = HiLink;

export const PROVIDER_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  'google-calendar': SiGooglecalendar,
  'outlook-calendar': HiEnvelopeOpen,
  'apple-calendar': SiApple,
  slack: SiSlack,
  notion: SiNotion,
  todoist: SiTodoist,
  canvas: SiCanvas,
  moodle: SiMoodle,
  github: SiGithub,
  zotero: SiZotero,
  'google-classroom': SiGoogleclassroom,
  'google-drive': SiGoogledrive,
  coursera: SiCoursera,
};

export const providerIcon = (id: string) => PROVIDER_ICONS[id] ?? FALLBACK_ICON;

export const CATEGORY_ORDER: IntegrationCategory[] = ['calendar', 'learning', 'communication', 'productivity'];

export const primaryAccountLine = (s: IntegrationStatus): string => {
  const info = s.accountInfo ?? {};
  for (const v of Object.values(info)) {
    if (typeof v === 'string' && v.trim()) return v;
  }
  return 'Connected';
};
