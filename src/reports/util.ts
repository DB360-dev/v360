/**
 * Shared data helpers for reports.
 * Reports read the same tables/views the portal already uses, always filtered to
 * the active brand (Row Level Security still decides what each person can read).
 */
import type { Figure } from "@/lib/excel";
import type { ReportFilters } from "./types";
import { STATUS } from "@/lib/status";
import type { FulfillmentSource, OrderStatus } from "@/lib/types";

/** Hard ceiling on rows fetched for one report (keeps the browser responsive). */
export const MAX_ROWS = 100_000;
const PAGE = 1000;

type PageResult<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

/**
 * Fetch every row of a query, 1,000 at a time (PostgREST's page limit).
 * `build(from, to)` must return a NEW query with `.range(from, to)` applied and a stable `.order(...)`.
 */
export async function fetchAll<T>(build: (from: number, to: number) => PageResult<T>, onPage?: (n: number) => void): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    onPage?.(out.length);
    if (rows.length < PAGE) break;
  }
  return out;
}

/** Split ids into chunks for `.in(col, chunk)` (keeps URLs short). */
export function chunk<T>(xs: T[], size = 150): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

/** Inclusive end-of-day timestamp for a yyyy-mm-dd `to` filter. */
export const endOfDay = (d: string) => `${d}T23:59:59.999`;

/** Apply the date-range filter to a query on `column` (timestamp or date). */
export function inRange<Q extends { gte: (c: string, v: string) => Q; lte: (c: string, v: string) => Q }>(q: Q, column: string, f: ReportFilters): Q {
  let out = q;
  if (f.from) out = out.gte(column, f.from);
  if (f.to) out = out.lte(column, endOfDay(f.to));
  return out;
}

/** Is an ISO date/timestamp inside the filter range (for in-memory filtering)? */
export function within(v: string | null | undefined, f: ReportFilters): boolean {
  if (!f.from && !f.to) return true;
  if (!v) return false;
  if (f.from && v < f.from) return false;
  if (f.to && v > endOfDay(f.to)) return false;
  return true;
}

/** Human filter lines for the Summary sheet. `dateOf` says which date the range applies to. */
export function filterLines(f: ReportFilters, brandName: string, dateOf?: string, extra: string[] = []): string[] {
  const lines: string[] = [`Brand: ${brandName}`];
  if (f.from || f.to) lines.push(`Date range${dateOf ? ` (${dateOf})` : ""}: ${f.from ?? "start"} to ${f.to ?? "today"}`);
  else if (dateOf) lines.push("Date range: all time");
  if (f.status) lines.push(`Status: ${statusLabel(f.status)}`);
  return [...lines, ...extra];
}

export const statusLabel = (s: string | null | undefined) => (s ? STATUS[s as OrderStatus]?.label ?? s : "");

export function groupBy<T, K extends string | number>(xs: T[], key: (x: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const x of xs) {
    const k = key(x);
    const g = m.get(k);
    if (g) g.push(x); else m.set(k, [x]);
  }
  return m;
}

export const sum = (xs: (number | null | undefined)[]) => xs.reduce<number>((a, b) => a + (Number(b) || 0), 0);
/** a / b as a fraction (Excel percent format), null when b is 0. */
export const ratio = (a: number, b: number) => (b ? a / b : null);

/** Days between two timestamps (b - a), null if either is missing. */
export function daysBetween(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  const d = (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000;
  return Number.isFinite(d) ? Math.round(d * 10) / 10 : null;
}

/** Key figure helper. */
export const fig = (label: string, value: Figure["value"], type: Figure["type"] = "number", money = false): Figure => ({ label, value, type, money });

/** Units of an order line filled from the brand's local stock (same rule as the order page). */
export function localUnits(i: { fulfillment_source: FulfillmentSource; inventory_qty: number | null; quantity: number }): number {
  // Database enum value (never shown): the whole line was filled locally.
  const allLocal = i.fulfillment_source === "bangladesh";
  return allLocal ? i.quantity : Math.min(i.inventory_qty ?? 0, i.quantity);
}

/** What happened to returned goods, in brand-facing words. */
const DISPOSITION: Record<string, string> = {
  pending: "Decision pending",
  restock_in_bd: "Restocked in your local stock",
  return_to_pk: "Sent back to origin",
  return_to_brand: "Returned to you",
  written_off: "Written off",
};
export const dispositionLabel = (v: string | null | undefined) => (v ? DISPOSITION[v] ?? v.replace(/_/g, " ") : "");

/** Blank city → "Unknown" for breakdowns. */
export const cityOf = (c: string | null | undefined) => (c && c.trim() ? c.trim() : "Unknown");
