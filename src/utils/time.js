const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;

function parseDateValue(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const text = String(value).trim();
  if (!text) return null;

  const vietnamese = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (vietnamese) {
    const [, day, month, year, hour = "0", minute = "0", second = "0"] = vietnamese;
    const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(2, "0")}:${minute.padStart(2, "0")}:${second.padStart(2, "0")}+07:00`;
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const dateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const date = new Date(`${text}T00:00:00+07:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoOrNull(value) {
  const date = parseDateValue(value);
  return date ? date.toISOString() : null;
}

function diffWholeDays(fromValue, toValue) {
  const from = parseDateValue(fromValue);
  const to = parseDateValue(toValue) || new Date();
  if (!from) return 0;
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY));
}

function diffHours(fromValue, toValue) {
  const from = parseDateValue(fromValue);
  const to = parseDateValue(toValue) || new Date();
  if (!from) return 0;
  return Math.max(0, (to.getTime() - from.getTime()) / MS_PER_HOUR);
}

function formatDateTime(value, timezone = "Asia/Ho_Chi_Minh") {
  const date = parseDateValue(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
}

function dateKey(value, timezone = "Asia/Ho_Chi_Minh") {
  const date = parseDateValue(value);
  if (!date) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function nowDate(config) {
  return parseDateValue(config && config.nowOverride) || new Date();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  MS_PER_DAY,
  parseDateValue,
  isoOrNull,
  diffWholeDays,
  diffHours,
  formatDateTime,
  dateKey,
  nowDate,
  sleep
};
