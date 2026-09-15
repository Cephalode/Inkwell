# PRD — Integrations Framework (Accounts & Calendars)

Branch: `feat/integrations` (off `feat/coursera-linking`). Settings → new "Accounts & Calendars" tab.

## Goal

Generalize the Coursera linking pattern into a first-class integrations system:
server-side provider registry (validate credentials, store, revalidate), generic REST,
and a Settings UI catalog grouped by category. Google Calendar, Outlook, Slack required;
plus more integrations (see provider list).

## HARD SAFETY RULES (read first)

- The working tree has 21 modified files from other in-progress work (run `git status`).
  DO NOT stage, commit, stash, checkout, or revert ANYTHING. Do not run `git add`.
  Only create NEW files, plus edit exactly these two EXISTING files:
  - `server/index.ts` (add integrations router mount)
  - `src/pages/SettingsPage.tsx` (add tabs)
  Do not touch `src/components/settings/SettingsPanel.tsx` — it stays as the AI tab content.
- No new npm dependencies. Node 18+ global fetch only.
- Credentials stored in Postgres JSONB (same trust level as existing `coursera_account.cauth`).

## Provider catalog (all implemented, v1)

| id | label | category | authKind | validate call |
|----|-------|----------|----------|---------------|
| google-calendar | Google Calendar | calendar | ics | fetch ICS URL, must contain BEGIN:VCALENDAR |
| outlook-calendar | Outlook Calendar | calendar | ics | same |
| apple-calendar | Apple Calendar | calendar | ics | same (iCloud public subscription URL) |
| slack | Slack | communication | token | POST https://slack.com/api/auth.test (Bearer) |
| notion | Notion | productivity | token | GET https://api.notion.com/v1/users/me, header Notion-Version: 2022-06-28 |
| todoist | Todoist | productivity | token | GET https://api.todoist.com/rest/v2/projects (Bearer) |
| canvas | Canvas LMS | learning | url+token | GET {url}/api/v1/users/self (Bearer) |
| moodle | Moodle | learning | url+token | POST {url}/webservice/rest/server.php wsfunction=core_webservice_get_site_info, wstoken, moodlewsrestformat=json |
| github | GitHub | productivity | token | GET https://api.github.com/user (Bearer) |
| zotero | Zotero | productivity | token | GET https://api.zotero.org/keys/current, header Zotero-API-Key |
| google-classroom | Google Classroom | learning | oauth | NOT IMPLEMENTED — `available: false`, description "Requires Google Cloud OAuth setup — coming soon" |
| google-drive | Google Drive | productivity | oauth | NOT IMPLEMENTED — `available: false`, "coming soon" |

Coursera appears in the catalog as connected/not via the existing `coursera_account`
table (read-only; UI links to /coursera to manage). It is NOT stored in the new table.

## Data model

`server/migrations/007_integrations.sql`:

```sql
CREATE TABLE IF NOT EXISTS integrations (
  provider TEXT PRIMARY KEY,
  credentials JSONB NOT NULL,
  account_info JSONB,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Migrations auto-apply via existing `server/migrations/run.ts` — just add the file.

## Shared types (server/src/integrations/types.ts)

```ts
export type IntegrationCategory = 'calendar' | 'learning' | 'communication' | 'productivity';
export type AuthKind = 'ics' | 'token' | 'url+token' | 'oauth';

export interface FieldSpec {
  key: string;            // matches key in `values`
  label: string;
  type: 'text' | 'password' | 'url';
  placeholder?: string;
  help?: string;          // shown under field in link form
}

export interface AccountInfo { [k: string]: string | number | undefined }

export interface CalendarEvent {
  title: string;
  start: string;          // ISO 8601
  end?: string;           // ISO 8601
  allDay?: boolean;
  location?: string;
}

export interface IntegrationProvider {
  id: string;
  label: string;
  description: string;    // one line
  category: IntegrationCategory;
  authKind: AuthKind;
  docsUrl?: string;       // where to get the credential
  available: boolean;     // false = coming soon (oauth ones)
  fields: FieldSpec[];    // empty for unavailable
  validate(values: Record<string, string>): Promise<AccountInfo>;  // throws Error('friendly message') on failure
  fetchUpcomingEvents?(values: Record<string, string>): Promise<CalendarEvent[]>;  // calendar providers only
}
```

`validate` error messages must be user-actionable ("Token rejected by Slack — check it starts with xoxb- or xoxp-").

## REST contract (server/routes/integrations.ts, mounted at /api/integrations)

1. `GET /api/integrations` → `{ integrations: IntegrationStatus[] }`

```ts
interface IntegrationStatus {
  id: string; label: string; description: string;
  category: IntegrationCategory; authKind: AuthKind;
  docsUrl?: string; available: boolean; fields: FieldSpec[];
  connected: boolean;
  accountInfo?: AccountInfo;
  linkedAt?: string;             // ISO
  managedElsewhere?: string;     // coursera → '/coursera' (no link/unlink via this API)
}
```

Every registry provider is listed (connected or not). Coursera merged in with
`managedElsewhere: '/coursera'`, connected = row exists in coursera_account.

2. `POST /api/integrations/:id/link` body `{ values: Record<string,string> }`
   → 200 `{ ok: true, accountInfo }` | 400 unknown id / unavailable / missing fields | 401 credential rejected | 502 provider unreachable. On success upsert row (credentials, account_info, timestamps).
3. `DELETE /api/integrations/:id/link` → `{ ok: true }` (idempotent; 404 unknown id)
4. `POST /api/integrations/:id/refresh` → re-run validate on stored creds → `{ ok: true, accountInfo }` (update row) | 401 `{ error: 'Connection lost — relink required' }`
5. `GET /api/integrations/:id/events` → `{ events: CalendarEvent[] }` — calendar providers only (others 400). Returns next 10 events from now-12h onward, sorted ascending. 401 if creds died.

## ICS helper (server/src/integrations/ics.ts)

- `parseIcs(text): CalendarEvent[]` — unfold continuation lines (lines starting with space/tab join previous), extract VEVENTs: SUMMARY, DTSTART, DTEND, LOCATION. Handle: `VALUE=DATE` (allDay, parse as local date, end = start+1d if missing), UTC `...Z`, TZID/floating treated as local time. Strip `DTSTART;X-RADICALE-...` style params by splitting on first `:` after property. Unescape `\,` `\;` `\n`. Skip VEVENTs missing SUMMARY or DTSTART. No RRULE expansion (skip recurring masters silently).
- `fetchUpcomingFromIcs(url): Promise<CalendarEvent[]>` — fetch (10s AbortSignal.timeout), text must contain BEGIN:VCALENDAR else throw 'Not a valid calendar (no BEGIN:VCALENDAR)', parse, filter start >= now-12h, sort, slice 10.
- All three ics providers: fields = `[{ key: 'url', label: 'Calendar iCal (ICS) URL', type: 'url', placeholder: 'https://calendar.google.com/calendar/ical/.../basic.ics', help: 'Google Calendar: Settings → your calendar → “Secret address in iCal format”. Outlook: Settings → Shared calendars → Publish a calendar. Read-only; updates when the provider refreshes the feed.' }]` (adapt help per provider). validate = fetch + must parse; accountInfo = `{ calendar: <hostname> }` plus counts: `{ events: <total parsed> }` where feasible. fetchUpcomingEvents = fetchUpcomingFromIcs.

## Provider specifics (server/src/integrations/registry.ts)

- slack: fields token (password, placeholder `xoxb-… or xoxp-…`, help "Create at api.slack.com/apps → your app → OAuth & Permissions → Bot User OAuth Token"). validate: POST form-encoded? No — auth.test takes Bearer header, returns `{ok:false,error}` — throw Error(`Slack rejected token: ${error}`). accountInfo `{ team, user }`.
- notion: token (password, `secret_…`, help "notion.so/my-integrations → your integration → Internal Integration Secret"). 401/403 → 'Notion rejected the token — share a page with the integration too'. accountInfo `{ bot: name }`.
- todoist: token (password, help "todoist.com → Settings → Integrations → API token"). validate GET /rest/v2/projects; accountInfo `{ projects: n }`.
- canvas: fields url (text, `https://<school>.instructure.com`) + token (password, help "Canvas → Account → Settings → Approved Integrations → New Access Token"). Reject URL not http(s). validate users/self; accountInfo `{ name, email, institution: hostname }`.
- moodle: same shape (url + token; token from site admin / user preferences web services). accountInfo `{ sitename, fullname, username }`.
- github: token (password, `ghp_…`/`github_pat_…`, help "github.com/settings/tokens → fine-grained, read-only"). accountInfo `{ login, name }`.
- zotero: key (password, help "zotero.org/settings/keys → Create new private key"). accountInfo `{ username }`.

All validate calls: wrap fetch failures (network/DNS) → throw Error('Could not reach <provider> — check the URL/network') → route maps to 502; credential rejection → 401. 10s timeout everywhere. Store values under the field keys as given.

## Frontend

### Types + client (new files, no changes to existing api client)
`src/types/integration.ts` mirrors server IntegrationStatus/FieldSpec/CalendarEvent.
`src/services/api/integrations.ts`:

```ts
export const listIntegrations = () => GET /api/integrations → IntegrationStatus[]
export const linkIntegration = (id, values: Record<string,string>) => POST → { ok, accountInfo }   // throws Error(message) with server .error
export const unlinkIntegration = (id) => DELETE → { ok }
export const refreshIntegration = (id) => POST /refresh → { ok, accountInfo }
export const getIntegrationEvents = (id) => GET /events → CalendarEvent[]
```

### Icon catalog — `src/config/integrations.ts`
Map id → react-icons component. MANDATORY (repo pitfall: silent blank page on bad icon exports): verify EVERY icon exists before using, e.g.
`node -e "const si=require('react-icons/si'); console.log(!!si.SiGooglecalendar)"`.
Known-good in this react-icons version: SiGooglecalendar, SiSlack, SiNotion, SiTodoist, SiCanvas, SiGithub, SiZotero, SiApple, SiGoogledrive, SiGoogleclassroom. There is NO SiMicrosoftoutlook/SiMicrosoft in this version — for outlook-calendar use `TbBrandOutlook` from react-icons/tb IF it exists (verify same way), else fallback HiOutlineMailOpen/HiCalendar from hi2. Fallback for any missing icon: HiLink from 'react-icons/hi2'. Also export CATEGORY_META: calendar/learning/communication/productivity → { label, icon } (HiCalendarDays, HiAcademicCap, HiChatAlt2, HiBriefcase — VERIFY each in hi2).

### SettingsPage.tsx rework (ONLY existing file edited on frontend)
Header + local tab state: `AI` | `Accounts & Calendars`. Tab bar styled like existing pills (`bg-cyan-600` active / `bg-slate-700`, rounded-lg, text-sm font-medium). `AI` renders existing `<SettingsPanel />` untouched. `Accounts & Calendars` renders new `<IntegrationsSection />`. Keep page max-w consistent (IntegrationsSection can use max-w-3xl).

### src/components/settings/IntegrationsSection.tsx
- Loads listIntegrations on mount (+ retry button on error, EmptyState not needed).
- Renders sections per category in order: Calendars, Learning Platforms, Communication, Productivity. Section header: category icon + label + connected count ("2 connected").
- Grid `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` of IntegrationCard.
- Refresh-all button (top right, ghost) hitting refresh on each connected provider sequentially (or Promise.allSettled), then reload list; per-card error surface.

### src/components/settings/IntegrationCard.tsx
Card (existing shared Card) with: provider icon (text-cyan-400 w-6 h-6), label, description (2-line clamp), status row.
- Not connected + available: muted "Not connected" + Button sm "Connect".
- Not connected + unavailable (oauth coming soon): badge "Coming soon", card slightly dimmed, no button.
- Connected: emerald dot + primary accountInfo line (pick first defined string value, e.g. team/login/sitename/calendar host), linkedAt date. Buttons: ghost sm "Refresh", ghost sm "Disconnect" (confirm via ConfirmDialog shared component).
- managedElsewhere (coursera): status + "Manage" button → navigate(managedElsewhere).
- Calendar providers when connected: "Upcoming" expandable — on first expand fetch getIntegrationEvents(id), show up to 5 (title, formatted datetime via toLocaleString, allDay → 'All day'), loading spinner, graceful error text. Collapse re-fetch not needed (cache in component state).

### src/components/settings/LinkIntegrationModal.tsx
Portal to document.body (repo pattern — backdrop-blur stacking trap), fixed inset-0, bg-black/60, centered Card max-w-md. Contents: provider icon+label, description, docs link (`docsUrl`, external), one input per FieldSpec (label/help/placeholder; type password → show/hide eye toggle like SettingsPanel), error banner (red-900/30 text-red-400 rounded-lg px-3 py-2 text-sm), Cancel + "Connect" (primary, isLoading while linking). On success: close, bubble up so section reloads. Validate client-side that all fields non-empty before submit.

Style: match existing dark slate/cyan theme exactly. Text-only buttons (no emoji in new UI copy except existing panel untouched).

## Verification (each subagent does its half)

Backend agent:
1. `cd server && npx tsc --noEmit -p .` or root `npx tsc -b` — zero errors.
2. Ensure Postgres up (`pg_isready -h /tmp`); start backend `npx tsx server/index.ts` in background (note: npx tsx false-death pitfall — verify via `curl -s localhost:3002/api/health`).
3. Confirm log line `[migrations] Applied: 007_integrations.sql`.
4. `curl -s localhost:3002/api/integrations` → 12 entries + coursera merged (13 total).
5. Start a throwaway static server with a generated .ics (python3 -m http.server in a tmp dir with 2 future VEVENTs + 1 past); `curl -X POST localhost:3002/api/integrations/google-calendar/link -H 'Content-Type: application/json' -d '{"values":{"url":"http://localhost:PORT/test.ics"}}'` → 200 + accountInfo; `curl -s localhost:3002/api/integrations/google-calendar/events` → 2 upcoming.
6. Bad creds: slack link with `xoxb-fake` → 401 with friendly error (real network call to slack.com). canvas link missing url → 400.
7. DELETE link → ok; refresh after delete → 404/401 handled without crash.
8. Kill test servers after.

Frontend agent:
1. `npm run build` passes (tsc -b && vite build).
2. Every icon verified via node -e (list the checks you ran).
3. Visual smoke: run vite (3001, backend may be down — IntegrationsSection must render a graceful error/retry state, not crash): open http://localhost:3001/settings with a browser, verify both tabs render, AI tab unchanged.

## Out of scope (do not build)
OAuth authorization-code flows, event write-back, Dashboard calendar card, recurring-event RRULE expansion, notifications/reminders.
