import clsx, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Joins class names; when two Tailwind utilities conflict (w-full, w-44), the last one wins. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Stable color for an avatar, derived from the user id. */
export function colorFromString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return `hsl(${hash % 360} 55% 45%)`;
}

export function taskRef(projectKey: string, number: number) {
  return `${projectKey}-${number}`;
}

export function parseTaskRef(ref: string): { key: string; number: number } | null {
  const match = /^([A-Za-z][A-Za-z0-9]{1,9})-(\d{1,9})$/.exec(ref.trim());
  if (!match) return null;
  return { key: match[1].toUpperCase(), number: Number(match[2]) };
}

export const APP_TIMEZONE = "America/Sao_Paulo";

/** Calendar date (YYYY-MM-DD) in the workspace timezone. Due dates are compared against it. */
export function todayISO(now: Date = new Date(), timeZone: string = APP_TIMEZONE) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function addDaysISO(day: string, amount: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function isOverdue(dueDate: string | null, done: boolean, today: string = todayISO()) {
  return !!dueDate && !done && dueDate < today;
}

const dayFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" });
const dayYearFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: APP_TIMEZONE,
});

/** Formats a calendar date (YYYY-MM-DD) without shifting it across timezones. */
export function formatDay(day: string, withYear = false) {
  const date = new Date(`${day}T00:00:00Z`);
  return (withYear ? dayYearFormatter : dayFormatter).format(date).replace(".", "");
}

export function formatDateTime(iso: string) {
  return dateTimeFormatter.format(new Date(iso)).replace(".", "");
}

export function formatMoney(amount: number, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

export function isValidISODate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}
