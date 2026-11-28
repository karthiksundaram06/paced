/**
 * "Share → Add to Paced": the share-sheet shortcut opens Paced at #add=<page title>, and Paced opens a
 * new task with a tidy name and the deadline picker ready.
 */

export const ADD_PREFIX = '#add=';

/** The shared title in "#add=…", or null when the link isn't an add. */
export function parseAddHash(hash: string): string | null {
  if (!hash.startsWith(ADD_PREFIX)) return null;
  const raw = hash.slice(ADD_PREFIX.length);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

// Bits of page titles that only name the website or the page type.
const SITE =
  /^(brightspace|d2l|leiden university|universiteit leiden|leiden|home|course home|homepage|assignments?|assignment submission|opdrachten|opdracht|dropbox|content|inhoud|submit|submission|view|quizzes|discussions|announcements|my courses|mail|inbox|outlook|gmail)$/i;
const CODE = /\b\d{4}[A-Z][A-Z0-9]{2,}\b/; // Leiden course codes like 4343SNACSY
const SEP = /\s+[-–—|·•]\s+/;
const MAX = 80;

const cap = (s: string) => (s.length > MAX ? `${s.slice(0, MAX - 1).trimEnd()}…` : s);

/** Course code → course name, learned from your timetable ("4343SNACSY - Social Network Analysis … - Hoorcollege"). */
export function courseNames(calendarTitles: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const title of calendarTitles) {
    const parts = title.split(SEP).map((p) => p.trim());
    const i = parts.findIndex((p) => CODE.test(p) && p.replace(CODE, '').trim().length < 3);
    if (i >= 0 && parts[i + 1]) map.set(parts[i].match(CODE)![0], parts[i + 1]);
  }
  return map;
}

/** "Social Network Analysis for Computer Scientists" → "SNACS"; short names stay as they are. */
export function shortCourse(name: string): string {
  const clean = name
    .replace(/\(.*?\)/g, '')
    .replace(CODE, '')
    .replace(/\s+/g, ' ')
    .trim();
  const words = clean.split(' ').filter(Boolean);
  if (words.length <= 3 && clean.length <= 24) return clean;
  const initials = words.filter((w) => /^[A-Z]/.test(w)).map((w) => w[0]);
  return initials.length >= 2 ? initials.join('') : clean;
}

/**
 * Turns whatever the share sheet passed (a page title, an email subject, a link) into a task name:
 * drops site names, "Re:"/"Fwd:" and course codes, and puts a short course name in front when it can tell.
 * Returns '' when there's nothing sensible (then you type the name).
 */
export function cleanSharedTitle(raw: string, calendarTitles: string[] = []): string {
  let s = raw.replace(/\s+/g, ' ').trim();
  if (!s) return '';

  // Only a link: use the end of its path if it reads like words.
  if (/^https?:\/\/\S+$/i.test(s)) {
    try {
      const url = new URL(s);
      if (/brightspace|d2l/i.test(url.hostname + url.pathname)) return ''; // Brightspace links are just ids
      const seg = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() ?? '');
      const words = seg.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[-_+]+/g, ' ').trim();
      return /[a-z]{3,}/i.test(words) && !/\d{4,}/.test(words) ? cap(words) : '';
    } catch {
      return '';
    }
  }

  s = s.replace(/^((re|fwd?|fw|aw|wg)\s*:\s*)+/i, '');
  const names = courseNames(calendarTitles);
  const known = new Set([...names.values()].map((n) => n.toLowerCase()));
  const bareOf = (p: string) => p.replace(CODE, '').replace(/[()[\]]/g, ' ').replace(/\s+/g, ' ').trim();

  // Page titles put the item first and the course after it ("Assignment 2 - Course (code) - Brightspace").
  const parts = s
    .split(SEP)
    .map((p) => p.trim())
    .filter((p) => p && !SITE.test(p) && !/^\(?\d{4}\s*[-/–]\s*\d{2,4}\)?$/.test(p)); // site names, "2026-2027"
  let course = '';
  const rest: string[] = [];
  parts.forEach((part, i) => {
    const code = part.match(CODE)?.[0];
    const bare = bareOf(part);
    const isCourse = known.has(part.toLowerCase()) || known.has(bare.toLowerCase()) || (!!code && (bare === '' || i > 0));
    if (isCourse) {
      if (!course) course = (code && names.get(code)) || bare || part;
      return;
    }
    if (code && !course) course = names.get(code) ?? '';
    rest.push(code ? bare : part);
  });

  // Email-style "[ADM] Project report": the bracket is the course.
  let main = rest[0] ?? '';
  const tag = main.match(/^\[([^\]]{2,24})\]\s*(.+)$/);
  if (tag) {
    course = course || tag[1];
    main = tag[2];
  }
  if (!main) main = course;
  if (!main) return '';
  const short = course ? shortCourse(course) : '';
  return cap(short && short !== main && !main.toLowerCase().includes(short.toLowerCase()) ? `${short} · ${main}` : main);
}
