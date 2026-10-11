export type IntegrationCategory = 'calendar' | 'learning' | 'communication' | 'productivity';
export type AuthKind = 'ics' | 'token' | 'url+token' | 'oauth';

export interface FieldSpec {
  key: string;
  label: string;
  type: 'text' | 'password' | 'url';
  placeholder?: string;
  help?: string;
}

export interface AccountInfo {
  [k: string]: string | number | undefined;
}

export interface CalendarEvent {
  title: string;
  start: string;
  end?: string;
  allDay?: boolean;
  location?: string;
}

export interface IntegrationStatus {
  id: string;
  label: string;
  description: string;
  category: IntegrationCategory;
  authKind: AuthKind;
  docsUrl?: string;
  available: boolean;
  fields: FieldSpec[];
  connected: boolean;
  accountInfo?: AccountInfo;
  linkedAt?: string;
  managedElsewhere?: string;
}
