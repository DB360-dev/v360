import { supabase } from "@/lib/supabase";
import type { Column, Row } from "@/lib/excel";
import { displayActor, neutralize } from "@/lib/neutral";
import type { OrderItem, OrderStatus } from "@/lib/types";
import type { ReportDef } from "./types";
import { ORDER_COLUMNS, firstReached, itemsSummary, latestInto, loadEvents, loadOrdersWithItems, loadOverview } from "./loaders";
import { chunk, cityOf, fetchAll, fig, filterLines, groupBy, ratio, statusLabel, sum } from "./util";

const byOrderNumber = (a: { order_number: string }, b: { order_number: string }) =>
  a.order_number.localeCompare(b.order_number, undefined, { numeric: true });

// ---------------------------------------------------------------- B1 Order register

const STAGES: OrderStatus[] = [
  "brand_confirmed", "confirmed", "brand_preparing", "dispatched_to_hub", "received_at_hub", "ready_for_shipment",
  "shipped", "arrived_bd", "received_by_partner", "out_for_delivery", "delivered", "delivery_failed", "returned", "cancelled",
];

const orderRegister: ReportDef = {
  code: "B1", perm: "reports.order_register", requires: ["orders.view"], category: "Orders",
  title: "Order register",
  description: "Every order with its customer, items, value, current status and the date it reached each stage.",
  filters: ["dateRange", "status"],
  async run(f, ctx) {
    const orders = await loadOverview(ctx, f);
    const ids = orders.map((o) => o.id);
    const reached = firstReached(await loadEvents(ids, ctx));
    const items = new Map<string, OrderItem[]>();
    for (const part of chunk(ids)) {
      const rows = await fetchAll<OrderItem>((from, to) =>
        supabase.from("order_items").select("*").in("order_id", part).order("id").range(from, to));
      for (const i of rows) items.set(i.order_id, [...(items.get(i.order_id) ?? []), i]);
      ctx.progress("Loading items…");
    }
    const rows = orders.map((o) => {
      const its = items.get(o.id) ?? [];
      const r: Row = {
        ...o, status_label: statusLabel(o.status),
        units: its.length ? sum(its.map((i) => i.quantity)) : o.item_count,
        skus: itemsSummary(its),
        tracking: o.delivery_tracking_number ?? o.shipment_tracking ?? o.inbound_tracking,
        inbound_courier: neutralize(o.inbound_courier),
        delivery_courier: neutralize(o.delivery_courier),
      };
      const s = reached.get(o.id) ?? {};
      for (const st of STAGES) r[`at_${st}`] = s[st] ?? null;
      return r;
    });
    const byStatus = [...groupBy(orders, (o) => o.status)].map(([s, os]) => ({ status: statusLabel(s), orders: os.length, value: sum(os.map((o) => o.order_total)) }));
    const byCity = [...groupBy(orders, (o) => cityOf(o.city))].map(([c, os]) => ({ city: c, orders: os.length, value: sum(os.map((o) => o.order_total)) }));
    return {
      title: "Order register",
      filters: filterLines(f, ctx.brandName, "order date"),
      figures: [
        fig("Orders", orders.length),
        fig("Order value", sum(orders.map((o) => o.order_total)), "money", true),
        fig("COD expected", sum(orders.map((o) => o.cod_amount_expected)), "money", true),
        fig("Delivered", orders.filter((o) => o.status === "delivered").length),
        fig("Cancelled", orders.filter((o) => o.status === "cancelled").length),
        fig("Returned", orders.filter((o) => o.status === "returned").length),
      ],
      breakdowns: [
        { name: "By status", columns: [{ header: "Status", key: "status" }, { header: "Orders", key: "orders", type: "number" }, { header: "Value", key: "value", type: "money", money: true }], rows: byStatus.sort((a, b) => b.orders - a.orders) },
        { name: "By city", columns: [{ header: "City", key: "city" }, { header: "Orders", key: "orders", type: "number" }, { header: "Value", key: "value", type: "money", money: true }], rows: byCity.sort((a, b) => b.orders - a.orders) },
      ],
      sheets: [{
        name: "Orders",
        columns: [
          ...ORDER_COLUMNS,
          { header: "Lines", key: "item_count", type: "number", width: 8 },
          { header: "Units", key: "units", type: "number", width: 8 },
          { header: "Items", key: "skus", width: 34 },
          { header: "Order total", key: "order_total", type: "money", money: true },
          { header: "Currency", key: "currency", width: 9, money: true },
          { header: "COD expected", key: "cod_amount_expected", type: "money", money: true },
          { header: "COD collected", key: "cod_amount_collected", type: "money", money: true },
          { header: "Your courier to hub", key: "inbound_courier", width: 16 },
          { header: "Shipment", key: "shipment_code", width: 12 },
          { header: "Delivery courier", key: "delivery_courier", width: 16 },
          { header: "Tracking", key: "tracking", width: 18 },
          ...STAGES.map((st): Column => ({ header: statusLabel(st), key: `at_${st}`, type: "datetime" })),
        ],
        rows,
      }],
    };
  },
};

// ---------------------------------------------------------------- B2 Confirmation outcomes

const OUTCOMES = ["Confirmed", "Cancelled", "Unreachable", "Needs amendment", "Pending"] as const;
type Outcome = (typeof OUTCOMES)[number];
const PENDING: OrderStatus[] = ["new", "brand_confirmed", "confirmation_pending"];

const confirmations: ReportDef = {
  code: "B2", perm: "reports.confirmations", category: "Orders",
  title: "Confirmation outcomes",
  description: "Which orders were confirmed, cancelled, unreachable, need changes or are still pending, with reasons and a breakdown by city.",
  filters: ["dateRange"],
  async run(f, ctx) {
    const orders = await loadOverview(ctx, f);
    const events = await loadEvents(orders.map((o) => o.id), ctx);
    const reached = firstReached(events);
    const into = latestInto(events, (s) => s === "cancelled" || s === "customer_unreachable" || s === "needs_amendment");

    const outcome = (s: OrderStatus, wasConfirmed: boolean): Outcome => {
      if (s === "cancelled") return "Cancelled";
      if (s === "customer_unreachable") return "Unreachable";
      if (s === "needs_amendment") return "Needs amendment";
      if (PENDING.includes(s)) return "Pending";
      if (s === "hold") return wasConfirmed ? "Confirmed" : "Pending";
      return "Confirmed";
    };
    const rows = orders.map((o) => {
      const r = reached.get(o.id) ?? {};
      const confirmedAt = r.confirmed ?? null;
      const oc = outcome(o.status, !!confirmedAt);
      const ev = oc === "Cancelled" || oc === "Unreachable" || oc === "Needs amendment" ? into.get(o.id) : undefined;
      return {
        ...o, status_label: statusLabel(o.status), outcome: oc,
        brand_confirmed_at: o.brand_confirmed_at ?? r.brand_confirmed ?? null,
        confirmed_at: confirmedAt,
        was_confirmed: confirmedAt ? "Yes" : "No",
        reason: ev ? neutralize(ev.note) : "",
        by: ev ? displayActor(ev.actor_label, ctx.brandName) : "",
        outcome_at: ev?.created_at ?? (oc === "Confirmed" ? confirmedAt : null),
      };
    });

    const n = orders.length;
    const byOutcome = OUTCOMES.map((oc) => {
      const c = rows.filter((r) => r.outcome === oc).length;
      return { outcome: oc, orders: c, share: ratio(c, n) };
    });
    const byCity = [...groupBy(rows, (r) => cityOf(r.city))].map(([city, rs]) => {
      const row: Row = { city, orders: rs.length };
      for (const oc of OUTCOMES) row[oc] = rs.filter((r) => r.outcome === oc).length;
      const decided = rs.filter((r) => r.outcome !== "Pending").length;
      row.rate = ratio(rs.filter((r) => r.outcome === "Confirmed").length, decided);
      return row;
    }).sort((a, b) => Number(b.orders) - Number(a.orders));
    const reasons = [...groupBy(rows.filter((r) => r.reason), (r) => `${r.outcome}|${r.reason}`)]
      .map(([k, rs]) => ({ outcome: k.split("|")[0], reason: k.slice(k.indexOf("|") + 1), orders: rs.length }))
      .sort((a, b) => b.orders - a.orders).slice(0, 50);

    const decided = rows.filter((r) => r.outcome !== "Pending").length;
    return {
      title: "Confirmation outcomes",
      filters: filterLines(f, ctx.brandName, "order date"),
      notes: ["Outcome is based on each order's current status. Reasons are the note given when the order last moved into that status."],
      figures: [
        fig("Orders", n),
        ...byOutcome.map((b) => fig(b.outcome, b.orders)),
        fig("Confirmation rate (of decided orders)", ratio(byOutcome[0].orders, decided), "percent"),
      ],
      breakdowns: [
        { name: "By outcome", columns: [{ header: "Outcome", key: "outcome" }, { header: "Orders", key: "orders", type: "number" }, { header: "Share", key: "share", type: "percent" }], rows: byOutcome },
        {
          name: "By city",
          columns: [
            { header: "City", key: "city" }, { header: "Orders", key: "orders", type: "number" },
            ...OUTCOMES.map((oc): Column => ({ header: oc, key: oc, type: "number" })),
            { header: "Confirmation rate", key: "rate", type: "percent" },
          ],
          rows: byCity,
        },
        { name: "Top reasons", columns: [{ header: "Outcome", key: "outcome" }, { header: "Reason", key: "reason" }, { header: "Orders", key: "orders", type: "number" }], rows: reasons },
      ],
      sheets: [{
        name: "Orders",
        columns: [
          ...ORDER_COLUMNS,
          { header: "Outcome", key: "outcome", width: 16 },
          { header: "Reason", key: "reason", width: 40 },
          { header: "Set by", key: "by", width: 12 },
          { header: "Outcome date", key: "outcome_at", type: "datetime" },
          { header: "Call attempts", key: "confirmation_attempts", type: "number" },
          { header: "Brand confirmed", key: "brand_confirmed_at", type: "datetime" },
          { header: "Customer confirmed", key: "confirmed_at", type: "datetime" },
          { header: "Was confirmed", key: "was_confirmed", width: 10 },
          { header: "Order total", key: "order_total", type: "money", money: true },
          { header: "Currency", key: "currency", width: 9, money: true },
        ],
        rows,
      }],
    };
  },
};

// ---------------------------------------------------------------- B3 Packing list

const packingList: ReportDef = {
  code: "B3", perm: "reports.packing_list", category: "Orders",
  title: "Packing list",
  description: "Confirmed orders waiting to be packed or sent to the hub, item by item, with pick totals per SKU.",
  filters: [],
  async run(f, ctx) {
    const orders = (await loadOrdersWithItems(ctx, f, { statuses: ["confirmed", "brand_preparing"], noDate: true })).sort(byOrderNumber);
    const showStock = ctx.can("inventory.view");
    const stock = new Map<string, number>();
    if (showStock) {
      ctx.progress("Loading local stock…");
      const inv = await fetchAll<{ sku: string; quantity_available: number }>((from, to) =>
        supabase.from("brand_inventory").select("sku, quantity_available").eq("brand_id", ctx.brandId).order("sku").range(from, to));
      for (const i of inv) stock.set(i.sku, Number(i.quantity_available) || 0);
    }
    const rows: Row[] = [];
    for (const o of orders) {
      const address = [o.address1, o.address2, o.city, o.province, o.zip].filter(Boolean).join(", ");
      for (const i of o.order_items) {
        rows.push({
          order_number: o.order_number, order_date: o.order_date, status_label: statusLabel(o.status), confirmed_at: o.confirmed_at,
          customer_name: o.customer_name, customer_phone: o.customer_phone, city: o.city, address,
          product_name: i.product_name, sku: i.sku, variant: i.variant, quantity: i.quantity,
          unit_price: i.unit_price, currency: o.currency,
          local_stock: i.sku && showStock ? stock.get(i.sku) ?? 0 : null,
          note: o.customer_note,
        });
      }
    }
    const picks = [...groupBy(rows, (r) => `${r.sku ?? ""}|${r.product_name}|${r.variant ?? ""}`)].map(([, rs]) => ({
      sku: rs[0].sku, product_name: rs[0].product_name, variant: rs[0].variant,
      quantity: sum(rs.map((r) => r.quantity as number)),
      orders: new Set(rs.map((r) => r.order_number)).size,
      local_stock: rs[0].local_stock,
    })).sort((a, b) => String(a.sku ?? a.product_name).localeCompare(String(b.sku ?? b.product_name), undefined, { numeric: true }));
    const stockCol: Column[] = showStock ? [{ header: "In local stock", key: "local_stock", type: "number" }] : [];
    return {
      title: "Packing list",
      filters: [`Brand: ${ctx.brandName}`, "Orders: Fulfilment confirmed and Ready to ship"],
      notes: showStock ? ["\"In local stock\" is what your local stock holds for that SKU now; you choose what to use from it when you send the parcel."] : [],
      figures: [
        fig("Orders", orders.length),
        fig("Lines", rows.length),
        fig("Units", sum(rows.map((r) => r.quantity as number))),
        fig("Fulfilment confirmed", orders.filter((o) => o.status === "confirmed").length),
        fig("Ready to ship", orders.filter((o) => o.status === "brand_preparing").length),
      ],
      breakdowns: [],
      sheets: [
        {
          name: "Packing list",
          columns: [
            { header: "Order", key: "order_number", width: 14 },
            { header: "Order date", key: "order_date", type: "date" },
            { header: "Status", key: "status_label", width: 20 },
            { header: "Confirmed", key: "confirmed_at", type: "datetime" },
            { header: "Customer", key: "customer_name" },
            { header: "Phone", key: "customer_phone", width: 16 },
            { header: "City", key: "city", width: 16 },
            { header: "Address", key: "address", width: 40 },
            { header: "Product", key: "product_name", width: 30 },
            { header: "SKU", key: "sku", width: 16 },
            { header: "Variant", key: "variant", width: 16 },
            { header: "Qty", key: "quantity", type: "number", width: 7 },
            ...stockCol,
            { header: "Unit price", key: "unit_price", type: "money", money: true },
            { header: "Currency", key: "currency", width: 9, money: true },
            { header: "Customer note", key: "note", width: 30 },
            { header: "Packed ✓", key: "packed", width: 9 },
          ],
          rows,
        },
        {
          name: "Pick totals",
          columns: [
            { header: "SKU", key: "sku", width: 16 },
            { header: "Product", key: "product_name", width: 30 },
            { header: "Variant", key: "variant", width: 16 },
            { header: "Units", key: "quantity", type: "number" },
            { header: "Orders", key: "orders", type: "number" },
            ...stockCol,
          ],
          rows: picks,
        },
      ],
    };
  },
};

// ---------------------------------------------------------------- B8 SKU sales

const skuSales: ReportDef = {
  code: "B8", perm: "reports.sku_sales", category: "Orders",
  title: "SKU sales",
  description: "Units ordered, delivered, returned and cancelled for each SKU, with delivered revenue.",
  filters: ["dateRange"],
  async run(f, ctx) {
    const orders = await loadOrdersWithItems(ctx, f);
    type Acc = { sku: string | null; product_name: string; ordered: number; delivered: number; returned: number; cancelled: number; failed: number; open: number; revenue: number; orders: Set<string> };
    const m = new Map<string, Acc>();
    const currencies = new Set<string>();
    for (const o of orders) {
      currencies.add(o.currency);
      for (const i of o.order_items) {
        const key = i.sku || `(no SKU) ${i.product_name}`;
        const a = m.get(key) ?? { sku: i.sku, product_name: i.product_name, ordered: 0, delivered: 0, returned: 0, cancelled: 0, failed: 0, open: 0, revenue: 0, orders: new Set<string>() };
        const q = Number(i.quantity) || 0;
        a.ordered += q;
        a.orders.add(o.id);
        if (o.status === "delivered") { a.delivered += q; a.revenue += q * (Number(i.unit_price) || 0) - (Number(i.discount) || 0); }
        else if (o.status === "returned") a.returned += q;
        else if (o.status === "cancelled") a.cancelled += q;
        else if (o.status === "delivery_failed") a.failed += q;
        else a.open += q;
        m.set(key, a);
      }
    }
    const rows = [...m.values()].map((a) => ({
      ...a, orders: a.orders.size,
      delivery_rate: ratio(a.delivered, a.delivered + a.returned + a.failed),
    })).sort((a, b) => b.ordered - a.ordered);
    return {
      title: "SKU sales",
      filters: filterLines(f, ctx.brandName, "order date"),
      notes: [
        "Units are counted by each order's current status. Delivered revenue is quantity × unit price less line discounts.",
        ...(currencies.size > 1 ? [`Orders use more than one currency (${[...currencies].join(", ")}); revenue adds them together.`] : []),
      ],
      figures: [
        fig("SKUs", rows.length),
        fig("Units ordered", sum(rows.map((r) => r.ordered))),
        fig("Units delivered", sum(rows.map((r) => r.delivered))),
        fig("Units returned", sum(rows.map((r) => r.returned))),
        fig("Units cancelled", sum(rows.map((r) => r.cancelled))),
        fig("Delivered revenue", sum(rows.map((r) => r.revenue)), "money", true),
      ],
      breakdowns: [{
        name: "Top 20 SKUs by units delivered",
        columns: [{ header: "SKU", key: "sku" }, { header: "Product", key: "product_name" }, { header: "Delivered", key: "delivered", type: "number" }, { header: "Revenue", key: "revenue", type: "money", money: true }],
        rows: [...rows].sort((a, b) => b.delivered - a.delivered).slice(0, 20),
      }],
      sheets: [{
        name: "SKU sales",
        columns: [
          { header: "SKU", key: "sku", width: 16 },
          { header: "Product", key: "product_name", width: 30 },
          { header: "Orders", key: "orders", type: "number" },
          { header: "Units ordered", key: "ordered", type: "number" },
          { header: "Delivered", key: "delivered", type: "number" },
          { header: "Returned", key: "returned", type: "number" },
          { header: "Delivery failed", key: "failed", type: "number" },
          { header: "Cancelled", key: "cancelled", type: "number" },
          { header: "In progress", key: "open", type: "number" },
          { header: "Delivery success", key: "delivery_rate", type: "percent" },
          { header: "Delivered revenue", key: "revenue", type: "money", money: true },
        ],
        rows,
      }],
    };
  },
};

export const ORDER_REPORTS: ReportDef[] = [orderRegister, confirmations, packingList, skuSales];
