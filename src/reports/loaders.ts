import { supabase } from "@/lib/supabase";
import type { Column } from "@/lib/excel";
import type { Order, OrderEvent, OrderItem, OrderOverview, OrderStatus } from "@/lib/types";
import type { ReportContext, ReportFilters } from "./types";
import { chunk, fetchAll, inRange } from "./util";

export type OrderWithItems = Order & { order_items: OrderItem[] };

/** The active brand's orders from order_overview, filtered by a date column and optional statuses. */
export async function loadOverview(
  ctx: ReportContext, f: ReportFilters,
  opts: { dateColumn?: string; statuses?: OrderStatus[] } = {},
): Promise<OrderOverview[]> {
  const dateColumn = opts.dateColumn ?? "order_date";
  return fetchAll<OrderOverview>((from, to) => {
    let q = supabase.from("order_overview").select("*").eq("brand_id", ctx.brandId);
    q = inRange(q, dateColumn, f);
    if (f.status) q = q.eq("status", f.status);
    if (opts.statuses) q = q.in("status", opts.statuses);
    return q.order("order_date", { ascending: true }).order("id").range(from, to);
  }, (n) => ctx.progress(`Loading orders… ${n.toLocaleString()}`));
}

/** The active brand's orders (full rows) with their items. */
export async function loadOrdersWithItems(
  ctx: ReportContext, f: ReportFilters,
  opts: { dateColumn?: string; statuses?: OrderStatus[]; noDate?: boolean } = {},
): Promise<OrderWithItems[]> {
  const dateColumn = opts.dateColumn ?? "order_date";
  const rows = await fetchAll<OrderWithItems>((from, to) => {
    let q = supabase.from("orders").select("*, order_items(*)").eq("brand_id", ctx.brandId);
    if (!opts.noDate) q = inRange(q, dateColumn, f);
    if (opts.statuses) q = q.in("status", opts.statuses);
    return q.order("order_date", { ascending: true }).order("id").range(from, to);
  }, (n) => ctx.progress(`Loading orders… ${n.toLocaleString()}`));
  for (const o of rows) o.order_items = (o.order_items ?? []).slice().sort((a, b) => a.product_name.localeCompare(b.product_name));
  return rows;
}

/** Status events for these orders (for "date reached each stage" and reasons). */
export async function loadEvents(orderIds: string[], ctx: ReportContext): Promise<OrderEvent[]> {
  const out: OrderEvent[] = [];
  for (const ids of chunk(orderIds)) {
    const rows = await fetchAll<OrderEvent>((from, to) =>
      supabase.from("order_events").select("id, order_id, actor_label, action, from_status, to_status, note, created_at")
        .in("order_id", ids).order("id").range(from, to));
    out.push(...rows);
    ctx.progress(`Loading order history… ${out.length.toLocaleString()}`);
  }
  return out;
}

/** order id → status → first time the order reached it. */
export function firstReached(events: OrderEvent[]): Map<string, Partial<Record<OrderStatus, string>>> {
  const m = new Map<string, Partial<Record<OrderStatus, string>>>();
  for (const e of events) {
    if (!e.to_status) continue;
    const s = m.get(e.order_id) ?? {};
    if (!s[e.to_status] || e.created_at < s[e.to_status]!) s[e.to_status] = e.created_at;
    m.set(e.order_id, s);
  }
  return m;
}

/** order id → the latest event that moved the order into `status` (for its note / reason). */
export function latestInto(events: OrderEvent[], status: (s: OrderStatus) => boolean): Map<string, OrderEvent> {
  const m = new Map<string, OrderEvent>();
  for (const e of events) {
    if (!e.to_status || !status(e.to_status)) continue;
    const cur = m.get(e.order_id);
    if (!cur || e.id > cur.id) m.set(e.order_id, e);
  }
  return m;
}

/** "SKU-1 ×2, SKU-2" for an order's lines. */
export const itemsSummary = (items: OrderItem[]) =>
  items.map((i) => `${i.sku || i.product_name}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`).join(", ");

/** Order-level columns shared by several reports. */
export const ORDER_COLUMNS: Column[] = [
  { header: "Order", key: "order_number", width: 14 },
  { header: "Order date", key: "order_date", type: "datetime" },
  { header: "Customer", key: "customer_name" },
  { header: "Phone", key: "customer_phone", width: 16 },
  { header: "City", key: "city", width: 16 },
  { header: "Status", key: "status_label", width: 22 },
  { header: "Status since", key: "status_changed_at", type: "datetime" },
];
