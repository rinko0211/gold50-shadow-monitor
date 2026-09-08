const NY_ZONE = "America/New_York";
const OPEN_MINUTES = 9 * 60 + 30;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoMarketDate(date) {
  if (!DATE_RE.test(date ?? "")) return false;
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

const nthWeekday = (year, month, weekday, n) => {
  const date = new Date(Date.UTC(year, month, 1));
  while (date.getUTCDay() !== weekday) date.setUTCDate(date.getUTCDate() + 1);
  date.setUTCDate(date.getUTCDate() + 7 * (n - 1));
  return date.toISOString().slice(0, 10);
};

const lastWeekday = (year, month, weekday) => {
  const date = new Date(Date.UTC(year, month + 1, 0));
  while (date.getUTCDay() !== weekday) date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
};

const observed = (year, month, day) => {
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() - 1);
  if (date.getUTCDay() === 0) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
};

const easter = (year) => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month, day));
};

export function isNyseHoliday(date) {
  if (!isValidIsoMarketDate(date)) return false;
  const year = Number(date.slice(0, 4));
  const goodFriday = easter(year);
  goodFriday.setUTCDate(goodFriday.getUTCDate() - 2);
  const holidays = [
    observed(year, 0, 1),
    nthWeekday(year, 0, 1, 3),
    nthWeekday(year, 1, 1, 3),
    goodFriday.toISOString().slice(0, 10),
    lastWeekday(year, 4, 1),
    observed(year, 6, 4),
    nthWeekday(year, 8, 1, 1),
    nthWeekday(year, 10, 4, 4),
    observed(year, 11, 25)
  ];
  if (year >= 2022) holidays.push(observed(year, 5, 19));
  return new Set(holidays).has(date);
}

export function isNyseSession(date) {
  if (!isValidIsoMarketDate(date)) return false;
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return ![0, 6].includes(weekday) && !isNyseHoliday(date);
}

export function nextNyseSession(date, delay = 1) {
  if (!isValidIsoMarketDate(date) || !Number.isInteger(delay) || delay < 1) {
    throw new Error("invalid NYSE session request");
  }
  const cursor = new Date(`${date}T12:00:00Z`);
  for (let count = 0; count < delay; count += 1) {
    do cursor.setUTCDate(cursor.getUTCDate() + 1);
    while (!isNyseSession(cursor.toISOString().slice(0, 10)));
  }
  return cursor.toISOString().slice(0, 10);
}

export function nyClock(isoTimestamp) {
  const date = new Date(isoTimestamp);
  if (!Number.isFinite(date.getTime())) throw new Error("invalid timestamp");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: NY_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    localDate: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute"))
  };
}

export function executionWindow(executionDate, now) {
  if (!isNyseSession(executionDate)) return "INVALID_SESSION";
  const clock = nyClock(now);
  if (clock.localDate < executionDate) return "UPCOMING_OPEN";
  if (clock.localDate > executionDate) return "OPEN_PASSED";
  return clock.minutes < OPEN_MINUTES ? "UPCOMING_OPEN" : "OPEN_PASSED";
}

export function completedNyseSessionsSince(generatedAt, now) {
  const start = nyClock(generatedAt);
  const end = nyClock(now);
  if (Date.parse(now) < Date.parse(generatedAt)) return Number.POSITIVE_INFINITY;
  let completed = 0;
  const cursor = new Date(`${start.localDate}T12:00:00Z`);
  while (cursor.toISOString().slice(0, 10) <= end.localDate) {
    const date = cursor.toISOString().slice(0, 10);
    if (isNyseSession(date)) {
      const afterGeneration = date > start.localDate || (date === start.localDate && start.minutes < 16 * 60);
      const completeNow = date < end.localDate || (date === end.localDate && end.minutes >= 16 * 60);
      if (afterGeneration && completeNow) completed += 1;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return completed;
}
