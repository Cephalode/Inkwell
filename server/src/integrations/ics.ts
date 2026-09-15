import { networkError, type CalendarEvent } from './types.js';

function unescapeIcs(value: string): string {
  return value.replace(/\\[nN]/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

interface ParsedDate { iso: string; allDay: boolean }

function parseIcsDate(prop: string, value: string): ParsedDate | null {
  const nameAndParams = prop.split(';');
  const params = nameAndParams.slice(1).join(';').toUpperCase();
  const v = value.trim();

  if (/^\d{8}$/.test(v) || params.includes('VALUE=DATE')) {
    const y = +v.slice(0, 4), m = +v.slice(4, 6), d = +v.slice(6, 8);
    if (!y || !m || !d) return null;
    return { iso: `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`, allDay: true };
  }

  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return null;
  const [, Y, Mo, D, H, Mi, S, z] = m;
  if (z === 'Z') {
    return { iso: new Date(Date.UTC(+Y, +Mo - 1, +D, +H, +Mi, +S)).toISOString(), allDay: false };
  }
  return { iso: new Date(+Y, +Mo - 1, +D, +H, +Mi, +S).toISOString(), allDay: false };
}

function plusOneDay(dateOnly: string): string {
  const d = new Date(`${dateOnly}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseIcs(text: string): CalendarEvent[] {
  const raw = text.split(/\r?\n/);
  const lines: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }

  const events: CalendarEvent[] = [];
  let cur: { title?: string; location?: string; start?: ParsedDate; end?: ParsedDate; rrule?: boolean } | null = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') {
      if (cur && cur.title && cur.start && !cur.rrule) {
        const ev: CalendarEvent = { title: cur.title, start: cur.start.iso };
        if (cur.start.allDay) {
          ev.allDay = true;
          ev.end = cur.end?.iso ?? plusOneDay(cur.start.iso);
        } else if (cur.end) {
          ev.end = cur.end.iso;
        }
        if (cur.location) ev.location = cur.location;
        events.push(ev);
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const prop = line.slice(0, idx);
    const value = line.slice(idx + 1);
    const name = prop.split(';')[0].toUpperCase();
    if (name === 'SUMMARY') cur.title = unescapeIcs(value.trim());
    else if (name === 'LOCATION') cur.location = unescapeIcs(value.trim());
    else if (name === 'DTSTART') cur.start = parseIcsDate(prop, value) ?? undefined;
    else if (name === 'DTEND') cur.end = parseIcsDate(prop, value) ?? undefined;
    else if (name === 'RRULE') cur.rrule = true;
  }
  return events;
}

export async function fetchUpcomingFromIcs(url: string): Promise<CalendarEvent[]> {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  } catch {
    throw networkError(`Could not reach calendar server — check the URL/network`);
  }
  const text = await res.text();
  if (!text.includes('BEGIN:VCALENDAR')) {
    throw new Error('Not a valid calendar (no BEGIN:VCALENDAR)');
  }
  const cutoff = Date.now() - 12 * 60 * 60 * 1000;
  return parseIcs(text)
    .filter((ev) => Date.parse(ev.start) >= cutoff)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
    .slice(0, 10);
}
