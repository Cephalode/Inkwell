import { authError, errorKind, networkError, type AccountInfo, type FieldSpec, type IntegrationProvider } from './types.js';
import { fetchUpcomingFromIcs, parseIcs } from './ics.js';

const TIMEOUT = 10_000;

/** Narrow an unknown JSON value to a string (undefined otherwise). */
function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function icsProvider(id: string, label: string, description: string, help: string, docsUrl: string): IntegrationProvider {
  const fields: FieldSpec[] = [{
    key: 'url', label: 'Calendar iCal (ICS) URL', type: 'url',
    placeholder: 'https://calendar.google.com/calendar/ical/.../basic.ics',
    help,
  }];
  return {
    id, label, description, docsUrl,
    category: 'calendar', authKind: 'ics', available: true, fields,
    async validate(values) {
      const url = (values.url ?? '').trim();
      if (!/^https?:\/\//i.test(url)) throw new Error('Enter the full https:// (or http://) ICS URL');
      let text: string;
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
        text = await res.text();
      } catch {
        throw networkError(`Could not reach calendar server — check the URL/network`);
      }
      if (!text.includes('BEGIN:VCALENDAR')) throw new Error('Not a valid calendar (no BEGIN:VCALENDAR)');
      const events = parseIcs(text).length;
      const account: AccountInfo = { calendar: new URL(url).hostname, events };
      return account;
    },
    fetchUpcomingEvents: (values) => fetchUpcomingFromIcs(values.url),
  };
}

async function jsonFetch(url: string, init: RequestInit, providerLabel: string): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT) });
  } catch {
    throw networkError(`Could not reach ${providerLabel} — check the URL/network`);
  }
  if (res.status === 401 || res.status === 403) throw authError(`${providerLabel} rejected the credentials — check the value and try again`);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${providerLabel} error ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

function tokenField(key: string, placeholder: string | undefined, help: string): FieldSpec {
  return { key, label: key === 'key' ? 'API key' : 'API token', type: 'password', placeholder, help };
}

const googleCalendar = icsProvider(
  'google-calendar', 'Google Calendar', 'Import read-only calendar events via secret iCal address.',
  'Google Calendar: Settings → your calendar → "Secret address in iCal format". Read-only; updates when Google refreshes the feed.',
  'https://support.google.com/calendar/answer/37648',
);

const outlookCalendar = icsProvider(
  'outlook-calendar', 'Outlook Calendar', 'Import read-only calendar events via published iCal URL.',
  'Outlook: Settings → Shared calendars → Publish a calendar. Read-only; updates when Outlook refreshes the feed.',
  'https://support.microsoft.com/en-us/office/publish-your-calendar-to-anyone-9e6b0496-70d5-4c1e-9f2b-6a0d0e0f0f0f',
);

const appleCalendar = icsProvider(
  'apple-calendar', 'Apple Calendar', 'Import read-only calendar events via iCloud public calendar link.',
  'Apple Calendar: Calendar → share → Public Calendar → copy the webcal URL (starts with webcal:// or https://). Read-only.',
  'https://support.apple.com/guide/calendar/share-a-calendar-icl1022/mac',
);

const slack: IntegrationProvider = {
  id: 'slack', label: 'Slack', description: 'Verify workspace bot tokens and show team info.',
  category: 'communication', authKind: 'token', available: true, docsUrl: 'https://api.slack.com/apps',
  fields: [tokenField('token', 'xoxb-… or xoxp-…', 'Create at api.slack.com/apps → your app → OAuth & Permissions → Bot User OAuth Token')],
  async validate(values) {
    let data: Record<string, unknown> | null;
    try {
      const res = await fetch('https://slack.com/api/auth.test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${values.token}` },
        signal: AbortSignal.timeout(TIMEOUT),
      });
      data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    } catch {
      throw networkError('Could not reach Slack — check the URL/network');
    }
    if (data?.ok) return { team: data.team as string, user: data.user as string };
    if (data && typeof data.error === 'string') {
      throw authError(`Slack rejected token: ${data.error} — check it starts with xoxb- or xoxp-`);
    }
    throw authError('Slack rejected the token — check it starts with xoxb- or xoxp-');
  },
};

const notion: IntegrationProvider = {
  id: 'notion', label: 'Notion', description: 'Verify internal integration tokens.',
  category: 'productivity', authKind: 'token', available: true, docsUrl: 'https://www.notion.so/my-integrations',
  fields: [tokenField('token', 'secret_…', 'notion.so/my-integrations → your integration → Internal Integration Secret')],
  async validate(values) {
    let me: Record<string, unknown> | undefined;
    try {
      me = await jsonFetch('https://api.notion.com/v1/users/me', {
        headers: { Authorization: `Bearer ${values.token}`, 'Notion-Version': '2022-06-28' },
      }, 'Notion');
    } catch (err) {
      if (errorKind(err) === 'auth') {
        throw authError('Notion rejected the token — share a page with the integration too');
      }
      throw err;
    }
    return { bot: str(me?.name) ?? 'integration' };
  },
};

const todoist: IntegrationProvider = {
  id: 'todoist', label: 'Todoist', description: 'Verify API tokens and count projects.',
  category: 'productivity', authKind: 'token', available: true, docsUrl: 'https://todoist.com/prefs/integrations',
  fields: [tokenField('token', undefined, 'todoist.com → Settings → Integrations → API token')],
  async validate(values) {
    const projects = await jsonFetch('https://api.todoist.com/rest/v2/projects', {
      headers: { Authorization: `Bearer ${values.token}` },
    }, 'Todoist');
    return { projects: Array.isArray(projects) ? projects.length : 0 };
  },
};

const canvas: IntegrationProvider = {
  id: 'canvas', label: 'Canvas LMS', description: 'Connect a Canvas instance with an access token.',
  category: 'learning', authKind: 'url+token', available: true, docsUrl: 'https://canvas.instructure.com/doc/api/file.oauth.html',
  fields: [
    { key: 'url', label: 'Canvas URL', type: 'text', placeholder: 'https://<school>.instructure.com', help: 'Your Canvas instance base URL' },
    { key: 'token', label: 'Access token', type: 'password', help: 'Canvas → Account → Settings → Approved Integrations → New Access Token' },
  ],
  async validate(values) {
    const url = (values.url ?? '').trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(url)) throw new Error('Canvas URL must start with http:// or https://');
    const me = await jsonFetch(`${url}/api/v1/users/self`, {
      headers: { Authorization: `Bearer ${values.token}` },
    }, 'Canvas');
    return { name: str(me?.name), email: str(me?.email), institution: new URL(url).hostname };
  },
};

const moodle: IntegrationProvider = {
  id: 'moodle', label: 'Moodle', description: 'Connect a Moodle site with a web services token.',
  category: 'learning', authKind: 'url+token', available: true, docsUrl: 'https://docs.moodle.org/en/Web_services',
  fields: [
    { key: 'url', label: 'Moodle URL', type: 'text', placeholder: 'https://moodle.example.edu', help: 'Your Moodle site base URL' },
    { key: 'token', label: 'Web services token', type: 'password', help: 'Site admin or user preferences → web services token' },
  ],
  async validate(values) {
    const url = (values.url ?? '').trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(url)) throw new Error('Moodle URL must start with http:// or https://');
    const body = new URLSearchParams({
      wsfunction: 'core_webservice_get_site_info', wstoken: values.token ?? '', moodlewsrestformat: 'json',
    });
    const data = await jsonFetch(`${url}/webservice/rest/server.php`, { method: 'POST', body }, 'Moodle');
    if (data?.exception || data?.error) {
      throw authError(`Moodle rejected the token: ${data.exception ?? data.error} — check the web services token`);
    }
    return { sitename: str(data?.sitename), fullname: str(data?.fullname), username: str(data?.username) };
  },
};

const github: IntegrationProvider = {
  id: 'github', label: 'GitHub', description: 'Verify personal access tokens.',
  category: 'productivity', authKind: 'token', available: true, docsUrl: 'https://github.com/settings/tokens',
  fields: [tokenField('token', 'ghp_… / github_pat_…', 'github.com/settings/tokens → fine-grained, read-only')],
  async validate(values) {
    const me = await jsonFetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${values.token}`, Accept: 'application/vnd.github+json' },
    }, 'GitHub');
    return { login: str(me?.login), name: str(me?.name) };
  },
};

const zotero: IntegrationProvider = {
  id: 'zotero', label: 'Zotero', description: 'Verify API keys for your library.',
  category: 'productivity', authKind: 'token', available: true, docsUrl: 'https://www.zotero.org/settings/keys',
  fields: [tokenField('key', undefined, 'zotero.org/settings/keys → Create new private key')],
  async validate(values) {
    const key = await jsonFetch('https://api.zotero.org/keys/current', {
      headers: { 'Zotero-API-Key': values.key ?? '' },
    }, 'Zotero');
    const user = key?.user as Record<string, unknown> | undefined;
    return { username: str(user?.username) ?? (typeof key?.userID === 'number' ? String(key.userID) : undefined) };
  },
};

function unavailable(id: string, label: string, description: string, docsUrl: string): IntegrationProvider {
  return {
    id, label, description, docsUrl,
    category: id === 'google-classroom' ? 'learning' : 'productivity',
    authKind: 'oauth', available: false, fields: [],
    async validate() { throw new Error(`${label} is not available yet`); },
  };
}

const googleClassroom = unavailable('google-classroom', 'Google Classroom', 'Requires Google Cloud OAuth setup — coming soon', 'https://developers.google.com/classroom');
const googleDrive = unavailable('google-drive', 'Google Drive', 'Requires Google Cloud OAuth setup — coming soon', 'https://developers.google.com/drive');

export const providers: IntegrationProvider[] = [
  googleCalendar, outlookCalendar, appleCalendar,
  slack, notion, todoist, canvas, moodle, github, zotero,
  googleClassroom, googleDrive,
];

export function getProvider(id: string): IntegrationProvider | undefined {
  return providers.find((p) => p.id === id);
}
