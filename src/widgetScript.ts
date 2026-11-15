/**
 * Lock Screen / Home Screen countdown widget for the free Scriptable app (iPhone).
 *
 * Paced can't make widgets itself (Safari web apps can't), but Scriptable can, and it can read the
 * "Paced" calendar: every deadline is written there as "⚑ Due: <task>" ending at the deadline.
 * Copied from Settings → Lock Screen countdown. Plain ES2017, no backticks (this is a template string).
 */
export const WIDGET_SCRIPT_NAME = 'Paced Deadlines';

export const WIDGET_SCRIPT = String.raw`// Paced Deadlines: live countdown to your next deadline.
// Lock Screen (rectangular, circular, inline) and Home Screen (small, medium, large).
// Reads the "Paced" calendar, which Paced fills when you tap Sync now.

const CALENDAR_NAME = "Paced";
const LOOK_AHEAD_DAYS = 60;
const LIVE_UNDER_HOURS = 48; // closer than this: hh:mm:ss ticking every second
const SOON_HOURS = 24; // Home Screen: countdown turns orange
const OPEN_URL = "shortcuts://run-shortcut?name=Paced%20Sync"; // tap: refresh and open Paced

const HOUR = 3600000;
const DAY = 24 * HOUR;
const now = new Date();
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

async function loadDeadlines() {
  let cal;
  try {
    cal = await Calendar.forEventsByTitle(CALENDAR_NAME);
  } catch (e) {
    return { error: "No \"Paced\" calendar" };
  }
  const events = await CalendarEvent.between(new Date(now.getTime() - DAY), new Date(now.getTime() + LOOK_AHEAD_DAYS * DAY), [cal]);
  const seen = {};
  const list = [];
  for (const ev of events) {
    const m = /^⚑\s*(Project due|Due):\s*(.+)$/.exec(ev.title || "");
    if (!m) continue;
    const due = new Date(ev.endDate.getTime());
    if (due.getTime() <= now.getTime()) continue;
    const title = m[2].trim();
    const key = title + "|" + due.getTime();
    if (seen[key]) continue; // the same deadline written twice
    seen[key] = true;
    list.push({ title: title, project: m[1] === "Project due", due: due });
  }
  list.sort(function (a, b) { return a.due.getTime() - b.due.getTime(); });
  return { list: list };
}

function pad(n) { return (n < 10 ? "0" : "") + n; }

function dueText(d) {
  const time = pad(d.getHours()) + ":" + pad(d.getMinutes());
  const day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - day0) / DAY);
  if (days === 0) return "Today " + time;
  if (days === 1) return "Tomorrow " + time;
  if (days < 7) return DAYS[d.getDay()] + " " + time;
  return d.getDate() + " " + MONTHS[d.getMonth()] + " " + time;
}

function daysLeftText(d) {
  const ms = d.getTime() - now.getTime();
  if (ms >= DAY) return Math.floor(ms / DAY) + "d";
  return Math.max(1, Math.floor(ms / HOUR)) + "h";
}

// A countdown that keeps ticking without the widget refreshing.
function addCountdown(parent, due, size, color) {
  const live = due.getTime() - now.getTime() < LIVE_UNDER_HOURS * HOUR;
  const el = parent.addDate(due);
  if (live) {
    el.applyTimerStyle();
    el.font = Font.semiboldMonospacedSystemFont(size);
  } else {
    el.applyRelativeStyle();
    el.font = Font.semiboldSystemFont(size);
  }
  el.lineLimit = 1;
  el.minimumScaleFactor = 0.5;
  if (color) el.textColor = color;
  return el;
}

function addLine(parent, text, font, opacity) {
  const el = parent.addText(text);
  el.font = font;
  el.lineLimit = 1;
  el.minimumScaleFactor = 0.7;
  if (opacity !== undefined) el.textOpacity = opacity;
  return el;
}

const data = await loadDeadlines();
const list = data.list || [];
const next = list[0];
const family = config.widgetFamily || (config.runsInWidget ? "small" : "accessoryRectangular");
const w = new ListWidget();
w.url = OPEN_URL;
const nextCheck = next ? Math.min(next.due.getTime() + 60000, now.getTime() + 15 * 60000) : now.getTime() + 15 * 60000;
w.refreshAfterDate = new Date(nextCheck);

const textColor = Color.dynamic(new Color("#111111"), new Color("#f4f4f6"));
const subColor = Color.dynamic(new Color("#6b6b73"), new Color("#9a9aa2"));
const soonColor = Color.dynamic(new Color("#c2410c"), new Color("#fb923c"));
const emptyTitle = data.error ? data.error : "No deadlines ahead";
const emptyHint = data.error ? "Make it in Calendar, then Sync in Paced" : "Sync now in Paced to update";

if (family === "accessoryInline") {
  addLine(w, next ? "⚑ " + next.title + " · " + dueText(next.due) : "⚑ " + emptyTitle, Font.body());
} else if (family === "accessoryCircular") {
  w.addAccessoryWidgetBackground = true;
  const flag = addLine(w, "⚑", Font.systemFont(11));
  flag.centerAlignText();
  if (next && next.due.getTime() - now.getTime() < LIVE_UNDER_HOURS * HOUR) {
    const c = addCountdown(w, next.due, 12);
    c.centerAlignText();
  } else {
    const big = addLine(w, next ? daysLeftText(next.due) : "–", Font.boldRoundedSystemFont(20));
    big.centerAlignText();
  }
} else if (family === "accessoryRectangular") {
  if (!next) {
    addLine(w, "⚑ " + emptyTitle, Font.boldSystemFont(14));
    addLine(w, emptyHint, Font.systemFont(12), 0.8).lineLimit = 2;
  } else {
    addLine(w, "⚑ " + next.title, Font.boldSystemFont(14));
    addCountdown(w, next.due, 22);
    const more = list.length - 1;
    addLine(w, (next.project ? "Project · " : "") + dueText(next.due) + (more > 0 ? " · +" + more + " more" : ""), Font.systemFont(12), 0.8);
  }
} else {
  // Home Screen
  w.backgroundColor = Color.dynamic(Color.white(), new Color("#1c1c1e"));
  const head = addLine(w, "DEADLINES", Font.boldSystemFont(11));
  head.textColor = subColor;
  w.addSpacer(6);
  if (!next) {
    addLine(w, emptyTitle, Font.boldSystemFont(15)).textColor = textColor;
    addLine(w, emptyHint, Font.systemFont(12)).textColor = subColor;
    w.addSpacer();
  } else if (family === "small") {
    const title = addLine(w, next.title, Font.boldSystemFont(15));
    title.lineLimit = 2;
    title.textColor = textColor;
    w.addSpacer();
    const soon = next.due.getTime() - now.getTime() < SOON_HOURS * HOUR;
    addCountdown(w, next.due, 24, soon ? soonColor : textColor);
    addLine(w, dueText(next.due), Font.systemFont(12)).textColor = subColor;
  } else {
    const rows = family === "medium" ? 3 : 7;
    for (const d of list.slice(0, rows)) {
      const soon = d.due.getTime() - now.getTime() < SOON_HOURS * HOUR;
      addLine(w, (d.project ? "■ " : "") + d.title, Font.boldSystemFont(14)).textColor = textColor;
      const row = w.addStack();
      row.layoutHorizontally();
      row.centerAlignContent();
      addCountdown(row, d.due, 13, soon ? soonColor : textColor);
      row.addSpacer(8);
      addLine(row, dueText(d.due), Font.systemFont(11)).textColor = subColor;
      w.addSpacer(6);
    }
    if (list.length > rows) addLine(w, "+" + (list.length - rows) + " more", Font.systemFont(11)).textColor = subColor;
    w.addSpacer();
  }
}

if (config.runsInWidget) {
  Script.setWidget(w);
} else {
  await w.presentAccessoryRectangular();
}
Script.complete();
`;
