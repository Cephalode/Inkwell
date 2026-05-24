export type ThemeMode = 'dark' | 'light';

export interface AIConfig {
  apiKey: string;
  provider: 'openai' | 'custom';
  baseUrl: string;
  model: string;
}

export interface PomodoroConfig {
  workDuration: number;
  breakDuration: number;
  longBreakDuration: number;
  sessionsBeforeLongBreak: number;
}

export interface AppSettings {
  ai: AIConfig;
  theme: ThemeMode;
  pomodoro: PomodoroConfig;
  defaultSummaryType: 'tldr' | 'keypoints' | 'detailed';
}

export const DEFAULT_SETTINGS: AppSettings = {
  ai: {
    apiKey: '',
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },
  theme: 'dark',
  pomodoro: {
    workDuration: 25,
    breakDuration: 5,
    longBreakDuration: 15,
    sessionsBeforeLongBreak: 4,
  },
  defaultSummaryType: 'keypoints',
};
