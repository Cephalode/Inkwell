export type ThemeMode = 'dark' | 'light';

export interface AIConfig {
  apiKey: string;
  provider: 'openai' | 'custom';
  baseUrl: string;
  model: string;
}

export interface AppSettings {
  ai: AIConfig;
  theme: ThemeMode;
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
  defaultSummaryType: 'keypoints',
};
