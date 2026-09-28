import { supabase } from "@/lib/supabase";
import type { Row } from "@/lib/excel";
import { displayActor, neutralize } from "@/lib/neutral";
import { INBOUND_STATUS } from "@/lib/status";
import type { InboundBatchOverview, OrderOverview, OrderStatus } from "@/lib/types";
import type { RestockedItem } from "@/hooks/useData";
import type { ReportDef } from "./types";
import { ORDER_COLUMNS, firstReached, itemsSummary, latestInto, loadEvents, loadOrdersWithItems, loadOverview, type OrderWithItems } from "./loaders";
import {
  chunk, cityOf, daysBetween, dispositionLabel, fetchAll, fig, filterLines, groupBy, inRange, localUnits, ratio, statusLabel, sum, within,
} from "./util";

const byOrderNumber = (a: { order_number: string }, b: { order_number: string }) =>
  a.order_number.localeCompare(b.order_number, undefined, { numeric: true });

/** The active brand's parcels to the hub, by dispatch date. */
async function loadBatches(ctx: Parameters<ReportDef["run"]>[1], f: Parameters<ReportDef["run"]>[0]) {
  return fetchAll<InboundBatchOverview>((from, to) => {
    let q = supabase.from("inbound_batch_overview").select("*").eq("brand_id", ctx.brandId);
    q = inRange(q, "dispatch_date", f);
    return q.order("dispatch_date", { ascending: true }).order("id").range(from, to);
  }, (n) => ctx.progress(`Loading dispatches… ${n.toLocaleString()}`));
}

// ---------------------------------------------------------------- B4 Dispatch history

const dispatches: ReportDef = {
  code: "B4", perm: "reports.brand_dispatches", category: "Dispatch & receiving",
  title: "Dispatch history",
  description: "Every parcel you sent to the hub: courier, tracking, date, orders, how many were received, are awaited or have issues.",
  filters: ["dateRange"],
  async run(f, ctx) {
    const batches = await loadBatches(ctx, f);
    const orders: (OrderOverview & { inbound_batch_id: string | null })[] = [];
    for (const ids of chunk(batches.map((b) => b.id))) {
      const rows = await fetchAll<OrderOverview & { inbound_batch_id: string | null }>((from, to) =>
        supabase.from("order_overview").select("*").eq("brand_id", ctx.brandId).in("inbound_batch_id", ids)
          .order("order_number").order("id").range(from, to));
      orders.push(...rows);
      ctx.progress(`Loading orders… ${orders.length.toLocaleString()}`);
    }
    const batchOf = new Map(batches.map((b) => [b.id, b]));
    const rows = batches.map((b) => ({
      ...b, courier: neutralize(b.courier), courier_status: neutralize(b.courier_status), notes: neutralize(b.notes),
      status_label: INBOUND_STATUS[b.status]?.label ?? b.status,
      days: daysBetween(b.dispatch_date, b.received_at),
    }));
    const byCourier = [...groupBy(rows, (b) => b.courier || "Unknown")].map(([c, bs]) => ({
      courier: c, parcels: bs.length, orders: sum(bs.map((b) => b.order_count)), issues: sum(bs.map((b) => b.issue_count)),
    })).sort((a, b) => b.parcels - a.parcels);
    return {
      title: "Dispatch history",
      filters: filterLines(f, ctx.brandName, "dispatch date"),
      figures: [
        fig("Parcels sent", batches.length),
        fig("Orders sent", sum(batches.map((b) => b.order_count))),
        fig("Orders received at hub", sum(batches.map((b) => b.received_count))),
        fig("Orders awaited", sum(batches.map((b) => b.awaiting_count))),
        fig("Orders with issues", sum(batches.map((b) => b.issue_count))),
        fig("Parcels with missing items", batches.filter((b) => b.status === "issue").length),
      ],
      breakdowns: [{
        name: "By courier",
        columns: [{ header: "Courier", key: "courier" }, { header: "Parcels", key: "parcels", type: "number" }, { header: "Orders", key: "orders", type: "number" }, { header: "Orders with issues", key: "issues", type: "number" }],
        rows: byCourier,
      }],
      sheets: [
        {
          name: "Parcels",
          columns: [
            { header: "Dispatch date", key: "dispatch_date", type: "date" },
            { header: "Courier", key: "courier", width: 18 },
            { header: "Tracking", key: "tracking_number", width: 20 },
            { header: "Status", key: "status_label", width: 18 },
            { header: "Courier status", key: "courier_status", width: 18 },
            { header: "Orders", key: "order_count", type: "number" },
            { header: "Received", key: "received_count", type: "number" },
            { header: "Awaiting", key: "awaiting_count", type: "number" },
            { header: "Issues", key: "issue_count", type: "number" },
            { header: "Received at", key: "received_at", type: "datetime" },
            { header: "Days to receive", key: "days", type: "days" },
            { header: "Notes", key: "notes", width: 30 },
          ],
          rows,
        },
        {
          name: "Orders in parcels",
          columns: [
            { header: "Dispatch date", key: "dispatch_date", type: "date" },
            { header: "Tracking", key: "tracking", width: 20 },
            ...ORDER_COLUMNS,
            { header: "Order total", key: "order_total", type: "money", money: true },
            { header: "Currency", key: "currency", width: 9, money: true },
          ],
          rows: orders.map((o) => {
            const b = o.inbound_batch_id ? batchOf.get(o.inbound_batch_id) : undefined;
            return { ...o, status_label: statusLabel(o.status), dispatch_date: b?.dispatch_date, tracking: b?.tracking_number };
          }).sort((a, b) => String(a.dispatch_date).localeCompare(String(b.dispatch_date)) || byOrderNumber(a, b)),
        },
      ],
    };
  },
};

// ---------------------------------------------------------------- B5 Receiving mismatches

const discrepancies: ReportDef = {
  code: "B5", perm: "reports.bd_discrepancies", category: "Dispatch & receiving",
  title: "Receiving mismatches",
  description: "Items the hub found short when your parcels arrived: sent, received and missing units per line.",
  filters: ["dateRange"],
  async run(f, ctx) {
    const batches = await loadBatches(ctx, f);
    const batchOf = new Map(batches.map((b) => [b.id, b]));
    const orders: OrderWithItems[] = [];
    for (const ids of chunk(batches.map((b) => b.id))) {
      const rows = await fetchAll<OrderWithItems>((from, to) =>
        supabase.from("orders").select("*, order_items(*)").eq("brand_id", ctx.brandId).in("inbound_batch_id", ids)
          .order("order_number").order("id").range(from, to));
      orders.push(...rows);
      ctx.progress(`Loading orders… ${orders.length.toLocaleString()}`);
    }
    const checked = orders.filter((o) => !!o.received_at_hub_at || o.status === "hub_issue" || o.status === "received_at_hub");
    const rows: Row[] = [];
    for (const o of checked.sort(byOrderNumber)) {
      const b = o.inbound_batch_id ? batchOf.get(o.inbound_batch_id) : undefined;
      for (const i of o.order_items ?? []) {
        const local = localUnits(i);
        const sent = i.quantity - local;
        const received = Number(i.received_quantity) || 0;
        if (received >= sent) continue;
        rows.push({
          order_number: o.order_number, order_date: o.order_date, status_label: statusLabel(o.status),
          customer_name: o.customer_name, city: o.city,
          dispatch_date: b?.dispatch_date, courier: neutralize(b?.courier), tracking: b?.tracking_number,
          received_at: o.received_at_hub_at,
          product_name: i.product_name, sku: i.sku, variant: i.variant,
          quantity: i.quantity, local, sent, received, short: sent - received,
          value_short: (sent - received) * (Number(i.unit_price) || 0), currency: o.currency,
          hub_notes: neutralize(o.hub_notes),
        });
      }
    }
    const bySku = [...groupBy(rows, (r) => String(r.sku ?? r.product_name))].map(([sku, rs]) => ({
      sku, product: rs[0].product_name, lines: rs.length, short: sum(rs.map((r) => r.short as number)),
    })).sort((a, b) => b.short - a.short);
    const shortOrders = new Set(rows.map((r) => r.order_number)).size;
    return {
      title: "Receiving mismatches",
      filters: filterLines(f, ctx.brandName, "dispatch date"),
      notes: ["Only lines the hub has checked are included. Units you filled from your local stock are not expected at the hub."],
      figures: [
        fig("Parcels in range", batches.length),
        fig("Orders checked at hub", checked.length),
        fig("Orders with missing items", shortOrders),
        fig("Share of checked orders", ratio(shortOrders, checked.length), "percent"),
        fig("Units missing", sum(rows.map((r) => r.short as number))),
        fig("Value of missing units", sum(rows.map((r) => r.value_short as number)), "money", true),
      ],
      breakdowns: [{
        name: "By SKU",
        columns: [{ header: "SKU", key: "sku" }, { header: "Product", key: "product" }, { header: "Lines", key: "lines", type: "number" }, { header: "Units missing", key: "short", type: "number" }],
        rows: bySku,
      }],
      sheets: [{
        name: "Missing items",
        columns: [
          { header: "Order", key: "order_number", width: 14 },
          { header: "Order date", key: "order_date", type: "date" },
          { header: "Status", key: "status_label", width: 18 },
          { header: "Customer", key: "customer_name" },
          { header: "City", key: "city", width: 16 },
          { header: "Dispatch date", key: "dispatch_date", type: "date" },
          { header: "Courier", key: "courier", width: 16 },
          { header: "Tracking", key: "tracking", width: 18 },
          { header: "Checked at hub", key: "received_at", type: "datetime" },
          { header: "Product", key: "product_name", width: 30 },
          { header: "SKU", key: "sku", width: 16 },
          { header: "Variant", key: "variant", width: 14 },
          { header: "Ordered", key: "quantity", type: "number" },
          { header: "From local stock", key: "local", type: "number" },
          { header: "Sent to hub", key: "sent", type: "number" },
          { header: "Received", key: "received", type: "number" },
          { header: "Missing", key: "short", type: "number" },
          { header: "Value missing", key: "value_short", type: "money", money: true },
          { header: "Currency", key: "currency", width: 9, money: true },
          { header: "Hub notes", key: "hub_notes", width: 36 },
        ],
        rows,
      }],
    };
  },
};

// ---------------------------------------------------------------- B6 Delivery outcomes

const FINAL: OrderStatus[] = ["delivered", "delivery_failed", "returned", "out_for_delivery"];
const OUTCOME_LABEL: Partial<Record<OrderStatus, string>> = {
  delivered: "Delivered", delivery_failed: "Delivery failed", returned: "Returned", out_for_delivery: "Still out for delivery",
};

const deliveryOutcomes: ReportDef = {
  code: "B6", perm: "reports.delivery_performance", category: "Delivery",
  title: "Delivery outcomes",
  description: "Delivered, failed and returned orders, the success rate by city and the reasons deliveries failed.",
  filters: ["dateRange"],
  async run(f, ctx) {
    const orders = await fetchAll<OrderWithItems>((from, to) => {
      let q = supabase.from("orders").select("*, order_items(*)").eq("brand_id", ctx.brandId).in("status", FINAL);
      q = inRange(q, "order_date", f);
      return q.order("order_date", { ascending: true }).order("id").range(from, to);
    }, (n) => ctx.progress(`Loading orders… ${n.toLocaleString()}`));
    const events = await loadEvents(orders.map((o) => o.id), ctx);
    const reached = firstReached(events);
    const failEv = latestInto(events, (s) => s === "delivery_failed" || s === "returned");
    const rows = orders.map((o) => {
      const r = reached.get(o.id) ?? {};
      const ev = failEv.get(o.id);
      const reason = neutralize(o.failure_reason) || neutralize(ev?.note);
      return {
        ...o, status_label: statusLabel(o.status), outcome: OUTCOME_LABEL[o.status] ?? statusLabel(o.status),
        out_at: r.out_for_delivery ?? null,
        delivered_at: o.delivered_at ?? r.delivered ?? null,
        failed_at: r.delivery_failed ?? null,
        returned_at: r.returned ?? null,
        had_failure: r.delivery_failed ? "Yes" : "No",
        reason: o.status === "delivered" ? "" : reason,
        reason_by: o.status !== "delivered" && ev ? displayActor(ev.actor_label, ctx.brandName) : "",
        days: daysBetween(o.order_date, o.delivered_at ?? r.delivered ?? null),
        delivery_courier: neutralize(o.delivery_courier),
        items: itemsSummary(o.order_items ?? []),
      };
    });
    const count = (rs: typeof rows, s: OrderStatus) => rs.filter((r) => r.status === s).length;
    const rate = (rs: typeof rows) => ratio(count(rs, "delivered"), count(rs, "delivered") + count(rs, "delivery_failed") + count(rs, "returned"));
    const byCity = [...groupBy(rows, (r) => cityOf(r.city))].map(([city, rs]) => ({
      city, orders: rs.length, delivered: count(rs, "delivered"), failed: count(rs, "delivery_failed"), returned: count(rs, "returned"),
      out: count(rs, "out_for_delivery"), rate: rate(rs),
      avg_days: (() => { const d = rs.map((r) => r.days).filter((x): x is number => x !== null); return d.length ? sum(d) / d.length : null; })(),
    })).sort((a, b) => b.orders - a.orders);
    const reasons = [...groupBy(rows.filter((r) => r.reason), (r) => r.reason)]
      .map(([reason, rs]) => ({ reason, orders: rs.length, failed: count(rs, "delivery_failed"), returned: count(rs, "returned") }))
      .sort((a, b) => b.orders - a.orders);
    const days = rows.map((r) => r.days).filter((x): x is number => x !== null);
    return {
      title: "Delivery outcomes",
      filters: filterLines(f, ctx.brandName, "order date"),
      notes: ["Covers orders that reached the delivery stage. Success rate = delivered ÷ (delivered + failed + returned)."],
      figures: [
        fig("Orders", rows.length),
        fig("Delivered", count(rows, "delivered")),
        fig("Delivery failed", count(rows, "delivery_failed")),
        fig("Returned", count(rows, "returned")),
        fig("Still out for delivery", count(rows, "out_for_delivery")),
        fig("Success rate", rate(rows), "percent"),
        fig("Average days from order to delivery", days.length ? sum(days) / days.length : null, "days"),
        fig("Delivered after a failed attempt", rows.filter((r) => r.status === "delivered" && r.had_failure === "Yes").length),
      ],
      breakdowns: [
        {
          name: "By city",
          columns: [
            { header: "City", key: "city" }, { header: "Orders", key: "orders", type: "number" },
            { header: "Delivered", key: "delivered", type: "number" }, { header: "Failed", key: "failed", type: "number" },
            { header: "Returned", key: "returned", type: "number" }, { header: "Still out", key: "out", type: "number" },
            { header: "Success rate", key: "rate", type: "percent" }, { header: "Avg days to deliver", key: "avg_days", type: "days" },
          ],
          rows: byCity,
        },
        {
          name: "Failure reasons",
          columns: [{ header: "Reason", key: "reason" }, { header: "Orders", key: "orders", type: "number" }, { header: "Failed", key: "failed", type: "number" }, { header: "Returned", key: "returned", type: "number" }],
          rows: reasons,
        },
      ],
      sheets: [{
        name: "Orders",
        columns: [
          ...ORDER_COLUMNS,
          { header: "Outcome", key: "outcome", width: 20 },
          { header: "Items", key: "items", width: 30 },
          { header: "Delivery courier", key: "delivery_courier", width: 16 },
          { header: "Tracking", key: "delivery_tracking_number", width: 18 },
          { header: "Out for delivery", key: "out_at", type: "datetime" },
          { header: "Delivered", key: "delivered_at", type: "datetime" },
          { header: "Failed", key: "failed_at", type: "datetime" },
          { header: "Returned", key: "returned_at", type: "datetime" },
          { header: "Had a failed attempt", key: "had_failure", width: 10 },
          { header: "Reason", key: "reason", width: 36 },
          { header: "Reason given by", key: "reason_by", width: 12 },
          { header: "Days to deliver", key: "days", type: "days" },
          { header: "Order total", key: "order_total", type: "money", money: true },
          { header: "Currency", key: "currency", width: 9, money: true },
        ],
        rows,
      }],
    };
  },
};

// ---------------------------------------------------------------- B7 Returns

const returns: ReportDef = {
  code: "B7", perm: "reports.returns", category: "Delivery",
  title: "Returns",
  description: "Returned orders, why they came back and what happened to the goods (restocked, sent back, written off).",
  filters: ["dateRange"],
  async run(f, ctx) {
    const all = await loadOrdersWithItems(ctx, f, { statuses: ["returned"], noDate: true });
    const events = await loadEvents(all.map((o) => o.id), ctx);
    const reached = firstReached(events);
    const into = latestInto(events, (s) => s === "returned" || s === "delivery_failed");
    const returnedAt = (id: string, fallback: string) => reached.get(id)?.returned ?? fallback;
    const orders = all.filter((o) => within(returnedAt(o.id, o.status_changed_at), f));

    ctx.progress("Loading restocked items…");
    const restocked = new Map<string, RestockedItem>();
    for (const ids of chunk(orders.map((o) => o.id))) {
      const rows = await fetchAll<RestockedItem>((from, to) =>
        supabase.from("bd_restocked_items").select("*").eq("brand_id", ctx.brandId).in("order_id", ids)
          .order("order_item_id").range(from, to));
      for (const r of rows) restocked.set(r.order_item_id, r);
    }

    const orderRows = orders.map((o) => {
      const ev = into.get(o.id);
      const units = sum((o.order_items ?? []).map((i) => i.quantity));
      const restockedUnits = sum((o.order_items ?? []).map((i) => (restocked.has(i.id) ? i.quantity : 0)));
      return {
        ...o, status_label: statusLabel(o.status), returned_at: returnedAt(o.id, o.status_changed_at),
        reason: neutralize(o.failure_reason) || neutralize(ev?.note),
        disposition: dispositionLabel(o.return_disposition) || "Decision pending",
        items: itemsSummary(o.order_items ?? []), units, restocked_units: restockedUnits,
      };
    }).sort((a, b) => a.returned_at.localeCompare(b.returned_at));
    const itemRows = orders.sort(byOrderNumber).flatMap((o) => (o.order_items ?? []).map((i) => {
      const r = restocked.get(i.id);
      return {
        order_number: o.order_number, returned_at: returnedAt(o.id, o.status_changed_at), customer_name: o.customer_name, city: o.city,
        disposition: dispositionLabel(o.return_disposition) || "Decision pending",
        product_name: i.product_name, sku: i.sku, variant: i.variant, quantity: i.quantity,
        restocked_at: r?.restocked_at ?? null, available_qty: r ? r.available_qty ?? r.quantity : null,
        restock_note: neutralize(r?.restock_note),
        value: i.quantity * (Number(i.unit_price) || 0) - (Number(i.discount) || 0), currency: o.currency,
      };
    }));
    const byDisposition = [...groupBy(orderRows, (r) => r.disposition)].map(([d, rs]) => ({
      disposition: d, orders: rs.length, units: sum(rs.map((r) => r.units)), value: sum(rs.map((r) => r.order_total)),
    })).sort((a, b) => b.orders - a.orders);
    const byReason = [...groupBy(orderRows, (r) => r.reason || "No reason given")].map(([reason, rs]) => ({ reason, orders: rs.length }))
      .sort((a, b) => b.orders - a.orders);
    const byCity = [...groupBy(orderRows, (r) => cityOf(r.city))].map(([city, rs]) => ({ city, orders: rs.length }))
      .sort((a, b) => b.orders - a.orders);
    return {
      title: "Returns",
      filters: filterLines(f, ctx.brandName, "date returned"),
      figures: [
        fig("Returned orders", orderRows.length),
        fig("Returned units", sum(orderRows.map((r) => r.units))),
        fig("Units restocked in your local stock", sum(orderRows.map((r) => r.restocked_units))),
        fig("Awaiting a decision", orderRows.filter((r) => r.disposition === "Decision pending").length),
        fig("Returned value", sum(orderRows.map((r) => r.order_total)), "money", true),
      ],
      breakdowns: [
        { name: "What happened to the goods", columns: [{ header: "Outcome", key: "disposition" }, { header: "Orders", key: "orders", type: "number" }, { header: "Units", key: "units", type: "number" }, { header: "Value", key: "value", type: "money", money: true }], rows: byDisposition },
        { name: "Reasons", columns: [{ header: "Reason", key: "reason" }, { header: "Orders", key: "orders", type: "number" }], rows: byReason },
        { name: "By city", columns: [{ header: "City", key: "city" }, { header: "Orders", key: "orders", type: "number" }], rows: byCity },
      ],
      sheets: [
        {
          name: "Returned orders",
          columns: [
            ...ORDER_COLUMNS,
            { header: "Returned", key: "returned_at", type: "datetime" },
            { header: "Reason", key: "reason", width: 36 },
            { header: "What happened to the goods", key: "disposition", width: 26 },
            { header: "Items", key: "items", width: 30 },
            { header: "Units", key: "units", type: "number" },
            { header: "Units restocked", key: "restocked_units", type: "number" },
            { header: "Order total", key: "order_total", type: "money", money: true },
            { header: "Currency", key: "currency", width: 9, money: true },
          ],
          rows: orderRows,
        },
        {
          name: "Returned items",
          columns: [
            { header: "Order", key: "order_number", width: 14 },
            { header: "Returned", key: "returned_at", type: "datetime" },
            { header: "Customer", key: "customer_name" },
            { header: "City", key: "city", width: 16 },
            { header: "What happened to the goods", key: "disposition", width: 26 },
            { header: "Product", key: "product_name", width: 30 },
            { header: "SKU", key: "sku", width: 16 },
            { header: "Variant", key: "variant", width: 14 },
            { header: "Qty", key: "quantity", type: "number", width: 7 },
            { header: "Restocked", key: "restocked_at", type: "datetime" },
            { header: "Still available", key: "available_qty", type: "number" },
            { header: "Restock note", key: "restock_note", width: 30 },
            { header: "Line value", key: "value", type: "money", money: true },
            { header: "Currency", key: "currency", width: 9, money: true },
          ],
          rows: itemRows,
        },
      ],
    };
  },
};

// ---------------------------------------------------------------- B12 COD summary

const codSummary: ReportDef = {
  code: "B12", perm: "reports.cod_collection", requires: ["orders.view_money"], category: "Delivery",
  title: "COD summary",
  description: "Delivered orders: cash on delivery expected versus collected, and any shortfall.",
  filters: ["dateRange"],
  async run(f, ctx) {
    const orders = await loadOverview(ctx, f, { dateColumn: "delivered_at", statuses: ["delivered"] });
    const rows = orders.map((o) => {
      const expected = Number(o.cod_amount_expected) || 0;
      const collected = o.cod_amount_collected === null || o.cod_amount_collected === undefined ? null : Number(o.cod_amount_collected);
      const state = collected === null ? "Not recorded yet" : collected >= expected ? "Collected in full" : collected > 0 ? "Short" : "Nothing collected";
      return {
        ...o, status_label: statusLabel(o.status), cod_currency: o.cod_currency ?? o.currency,
        expected, collected, difference: collected === null ? null : collected - expected, state,
      };
    }).sort((a, b) => String(a.delivered_at).localeCompare(String(b.delivered_at)));
    const expected = sum(rows.map((r) => r.expected));
    const collected = sum(rows.map((r) => r.collected));
    const recorded = rows.filter((r) => r.collected !== null);
    const byState = [...groupBy(rows, (r) => r.state)].map(([state, rs]) => ({
      state, orders: rs.length, expected: sum(rs.map((r) => r.expected)), collected: sum(rs.map((r) => r.collected)),
    }));
    const byMonth = [...groupBy(rows, (r) => (r.delivered_at ?? "").slice(0, 7) || "Unknown")].map(([month, rs]) => ({
      month, orders: rs.length, expected: sum(rs.map((r) => r.expected)), collected: sum(rs.map((r) => r.collected)),
    })).sort((a, b) => a.month.localeCompare(b.month));
    const byCity = [...groupBy(rows, (r) => cityOf(r.city))].map(([city, rs]) => ({
      city, orders: rs.length, expected: sum(rs.map((r) => r.expected)), collected: sum(rs.map((r) => r.collected)),
    })).sort((a, b) => b.orders - a.orders);
    const currencies = [...new Set(rows.map((r) => r.cod_currency))];
    const moneyCols = [
      { header: "Orders", key: "orders", type: "number" as const },
      { header: "Expected", key: "expected", type: "money" as const, money: true },
      { header: "Collected", key: "collected", type: "money" as const, money: true },
    ];
    return {
      title: "COD summary",
      filters: filterLines(f, ctx.brandName, "delivery date"),
      notes: currencies.length > 1 ? [`Cash was collected in more than one currency (${currencies.join(", ")}); totals add them together.`] : [],
      figures: [
        fig("Delivered orders", rows.length),
        fig("Cash expected", expected, "money", true),
        fig("Cash collected", collected, "money", true),
        fig("Difference (collected − expected, recorded orders)", sum(recorded.map((r) => r.difference)), "money", true),
        fig("Collection recorded", ratio(recorded.length, rows.length), "percent"),
        fig("Orders short", rows.filter((r) => r.state === "Short" || r.state === "Nothing collected").length),
      ],
      breakdowns: [
        { name: "By collection state", columns: [{ header: "State", key: "state" }, ...moneyCols], rows: byState },
        { name: "By month delivered", columns: [{ header: "Month", key: "month" }, ...moneyCols], rows: byMonth },
        { name: "By city", columns: [{ header: "City", key: "city" }, ...moneyCols], rows: byCity },
      ],
      sheets: [{
        name: "Delivered orders",
        columns: [
          { header: "Order", key: "order_number", width: 14 },
          { header: "Order date", key: "order_date", type: "date" },
          { header: "Delivered", key: "delivered_at", type: "datetime" },
          { header: "Customer", key: "customer_name" },
          { header: "Phone", key: "customer_phone", width: 16 },
          { header: "City", key: "city", width: 16 },
          { header: "Order total", key: "order_total", type: "money", money: true },
          { header: "COD currency", key: "cod_currency", width: 9, money: true },
          { header: "COD expected", key: "expected", type: "money", money: true },
          { header: "COD collected", key: "collected", type: "money", money: true },
          { header: "Difference", key: "difference", type: "money", money: true },
          { header: "Collection", key: "state", width: 18 },
          { header: "Tracking", key: "delivery_tracking_number", width: 18 },
        ],
        rows,
      }],
    };
  },
};

export const DISPATCH_REPORTS: ReportDef[] = [dispatches, discrepancies];
export const DELIVERY_REPORTS: ReportDef[] = [deliveryOutcomes, returns, codSummary];
