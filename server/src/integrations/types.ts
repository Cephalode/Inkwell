export type IntegrationCategory = 'calendar' | 'learning' | 'communication' | 'productivity';
export type AuthKind = 'ics' | 'token' | 'url+token' | 'oauth';

export interface FieldSpec {
  key: string;
  label: string;
  type: 'text' | 'password' | 'url';
  placeholder?: string;
  help?: string;
}

export interface AccountInfo { [k: string]: string | number | undefined }

export interface CalendarEvent {
  title: string;
  start: string;
  end?: string;
  allDay?: boolean;
  location?: string;
}

export interface IntegrationProvider {
  id: string;
  label: string;
  description: string;
  category: IntegrationCategory;
  authKind: AuthKind;
  docsUrl?: string;
  available: boolean;
  fields: FieldSpec[];
  validate(values: Record<string, string>): Promise<AccountInfo>;
  fetchUpcomingEvents?(values: Record<string, string>): Promise<CalendarEvent[]>;
}

export interface KindedError extends Error {
  kind?: 'auth' | 'network';
}

export function authError(msg: string): KindedError {
  const err = new Error(msg) as KindedError;
  err.kind = 'auth';
  return err;
}

export function networkError(msg: string): KindedError {
  const err = new Error(msg) as KindedError;
  err.kind = 'network';
  return err;
}

export function errorKind(err: unknown): 'auth' | 'network' | undefined {
  return (err as KindedError | undefined)?.kind;
}
