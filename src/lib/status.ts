import type { InboundStatus, OrderStatus, ShipmentStatus } from "./types";

/** Who needs to act next — drives badge colour everywhere. */
export type StatusGroup = "brand" | "confirming" | "hub" | "transit" | "done" | "problem" | "closed";

export const STATUS: Record<OrderStatus, { label: string; group: StatusGroup; hint: string }> = {
  new:                    { label: "New", group: "brand", hint: "Confirm this order is correct so our team can call the customer." },
  brand_confirmed:        { label: "Brand confirmed", group: "confirming", hint: "You've confirmed this order. Our team will call the customer next." },
  confirmation_pending:   { label: "Confirmation pending", group: "confirming", hint: "Our team is confirming this order with the customer." },
  customer_unreachable:   { label: "Customer unreachable", group: "confirming", hint: "We couldn't reach the customer yet and will try again." },
  needs_amendment:        { label: "Needs amendment", group: "brand", hint: "The customer asked for a change. Update the order details so we can reconfirm." },
  confirmed:              { label: "Fulfilment confirmed", group: "brand", hint: "The customer confirmed with the delivery partner. Prepare the items and mark the order ready to ship." },
  cancelled:              { label: "Cancelled", group: "closed", hint: "This order was cancelled." },
  brand_preparing:        { label: "Ready to ship", group: "brand", hint: "Packed and ready to ship. Dispatch it to the hub." },
  dispatched_to_hub:      { label: "Dispatched to hub", group: "hub", hint: "On its way to the hub. Every item is checked on arrival." },
  received_at_hub:        { label: "Received at hub", group: "hub", hint: "The hub has received this order." },
  hub_issue:              { label: "Hub issue", group: "problem", hint: "Some items didn't arrive at the hub. Send the missing items." },
  ready_for_shipment:     { label: "Ready for shipment", group: "hub", hint: "All items are at the hub. It will go out with the next shipment." },
  assigned_to_shipment:   { label: "In a shipment", group: "hub", hint: "Packed into a shipment, waiting to leave the hub." },
  shipped:                { label: "Shipped", group: "transit", hint: "The shipment has left the hub." },
  in_transit:             { label: "In transit", group: "transit", hint: "The shipment is on its way." },
  customs:                { label: "In customs", group: "transit", hint: "The shipment is being cleared through customs." },
  arrived_bd:             { label: "Arrived at destination", group: "transit", hint: "The shipment has arrived in the customer's country." },
  received_by_partner:    { label: "With delivery partner", group: "transit", hint: "Our delivery partner has the order and will deliver it." },
  preparing_for_delivery: { label: "Preparing delivery", group: "transit", hint: "Being prepared for delivery to the customer." },
  out_for_delivery:       { label: "Out for delivery", group: "transit", hint: "Out with the courier for delivery." },
  delivered:              { label: "Delivered", group: "done", hint: "Delivered to the customer." },
  delivery_failed:        { label: "Delivery failed", group: "problem", hint: "The delivery attempt failed. We'll retry or return it." },
  returned:               { label: "Returned", group: "problem", hint: "The customer didn't accept the order. Our team will decide what happens to the items." },
  hold:                   { label: "On hold", group: "problem", hint: "This order is paused. Our team will resume it." },
};

export const GROUP_LABEL: Record<StatusGroup, string> = {
  brand: "Needs your action", confirming: "Being confirmed", hub: "At hub", transit: "On the way",
  done: "Delivered", problem: "Needs attention", closed: "Cancelled",
};

export const GROUP_CLASSES: Record<StatusGroup, { text: string; bg: string; dot: string }> = {
  brand:      { text: "text-g-brand",   bg: "bg-g-brand-bg",   dot: "bg-g-brand" },
  confirming: { text: "text-g-confirm", bg: "bg-g-confirm-bg", dot: "bg-g-confirm" },
  hub:        { text: "text-g-hub",     bg: "bg-g-hub-bg",     dot: "bg-g-hub" },
  transit:    { text: "text-g-transit", bg: "bg-g-transit-bg", dot: "bg-g-transit" },
  done:       { text: "text-g-done",    bg: "bg-g-done-bg",    dot: "bg-g-done" },
  problem:    { text: "text-g-problem", bg: "bg-g-problem-bg", dot: "bg-g-problem" },
  closed:     { text: "text-g-closed",  bg: "bg-g-closed-bg",  dot: "bg-g-closed" },
};

/** Tabs on the Orders page, in order. "All" comes first; each status belongs to exactly one other tab. */
const TABS_BEFORE_OTHERS: { key: string; label: string; statuses: OrderStatus[] }[] = [
  { key: "new", label: "New", statuses: ["new"] },
  { key: "brand-confirmed", label: "Confirmed by Brand", statuses: ["brand_confirmed", "confirmation_pending", "customer_unreachable"] },
  { key: "fp-confirmed", label: "Confirmed by FP", statuses: ["confirmed"] },
  { key: "ready", label: "Ready to dispatch", statuses: ["brand_preparing"] },
  { key: "received", label: "Received by FP", statuses: ["arrived_bd", "received_by_partner", "preparing_for_delivery"] },
  { key: "out", label: "Out for Delivery", statuses: ["out_for_delivery"] },
  { key: "delivered", label: "Delivered", statuses: ["delivered"] },
  { key: "returned", label: "Returned", statuses: ["returned"] },
  { key: "attention", label: "Need Attention", statuses: ["hold", "cancelled"] },
];

export const ORDER_TABS: { key: string; label: string; statuses: OrderStatus[] | null }[] = [
  { key: "all", label: "All", statuses: null },
  ...TABS_BEFORE_OTHERS,
  {
    key: "others", label: "Others",
    statuses: (Object.keys(STATUS) as OrderStatus[]).filter((s) => !TABS_BEFORE_OTHERS.some((t) => t.statuses.includes(s))),
  },
];

/** The journey rail: six legs every order travels. */
export const JOURNEY: { key: string; label: string; statuses: OrderStatus[] }[] = [
  { key: "confirm", label: "Confirm", statuses: ["new", "brand_confirmed", "confirmation_pending", "customer_unreachable", "needs_amendment"] },
  { key: "prepare", label: "Prepare", statuses: ["confirmed", "brand_preparing"] },
  { key: "hub", label: "Hub", statuses: ["dispatched_to_hub", "received_at_hub", "hub_issue", "ready_for_shipment", "assigned_to_shipment"] },
  { key: "shipment", label: "In transit", statuses: ["shipped", "in_transit", "customs", "arrived_bd"] },
  { key: "bd", label: "Last mile", statuses: ["received_by_partner", "preparing_for_delivery", "out_for_delivery", "delivery_failed", "returned"] },
  { key: "delivered", label: "Delivered", statuses: ["delivered"] },
];

export function journeyIndex(status: OrderStatus): number {
  return JOURNEY.findIndex((leg) => leg.statuses.includes(status));
}

/** Master status thumbnails: the full journey as compact milestones. */
export const MASTER_RAIL: { label: string; statuses: OrderStatus[] }[] = [
  { label: "New",                  statuses: ["new"] },
  { label: "Brand confirmed",      statuses: ["brand_confirmed"] },
  { label: "Fulfilment confirmed", statuses: ["confirmation_pending", "customer_unreachable", "needs_amendment", "confirmed", "brand_preparing"] },
  { label: "Shipped to hub",       statuses: ["dispatched_to_hub"] },
  { label: "Received at hub",      statuses: ["received_at_hub", "hub_issue", "ready_for_shipment"] },
  { label: "Dispatched",           statuses: ["assigned_to_shipment", "shipped", "in_transit", "customs"] },
  { label: "Arrived bd",           statuses: ["arrived_bd", "received_by_partner", "preparing_for_delivery"] },
  { label: "Out for delivery",     statuses: ["out_for_delivery", "delivery_failed", "returned"] },
  { label: "Delivered",            statuses: ["delivered"] },
];

export function masterRailIndex(status: OrderStatus): number {
  return MASTER_RAIL.findIndex((m) => m.statuses.includes(status));
}

export type ColumnStatus = { label: string; group: StatusGroup };

/** Brand column: only what the brand has done. New → Confirmed → Shipped to hub. */
const BRAND_COLUMN: Record<OrderStatus, ColumnStatus> = {
  new:                    { label: "New", group: "brand" },
  brand_confirmed:        { label: "Confirmed", group: "confirming" },
  confirmation_pending:   { label: "Confirmed", group: "confirming" },
  customer_unreachable:   { label: "Confirmed", group: "confirming" },
  needs_amendment:        { label: "Amendment", group: "brand" },
  confirmed:              { label: "Confirmed", group: "brand" },
  cancelled:              { label: "Cancelled", group: "closed" },
  brand_preparing:        { label: "Ready to ship", group: "brand" },
  dispatched_to_hub:      { label: "Shipped to hub", group: "hub" },
  received_at_hub:        { label: "Shipped to hub", group: "hub" },
  hub_issue:              { label: "Hub issue", group: "problem" },
  ready_for_shipment:     { label: "Shipped to hub", group: "hub" },
  assigned_to_shipment:   { label: "Shipped to hub", group: "hub" },
  shipped:                { label: "Shipped to hub", group: "transit" },
  in_transit:             { label: "Shipped to hub", group: "transit" },
  customs:                { label: "Shipped to hub", group: "transit" },
  arrived_bd:             { label: "Shipped to hub", group: "transit" },
  received_by_partner:    { label: "Shipped to hub", group: "transit" },
  preparing_for_delivery: { label: "Shipped to hub", group: "transit" },
  out_for_delivery:       { label: "Shipped to hub", group: "transit" },
  delivered:              { label: "Shipped to hub", group: "done" },
  delivery_failed:        { label: "Delivery failed", group: "problem" },
  returned:               { label: "Returned", group: "problem" },
  hold:                   { label: "On hold", group: "problem" },
};

export function brandStatus(status: OrderStatus): ColumnStatus {
  return BRAND_COLUMN[status];
}

/** Fulfilment column: the delivery partner's view of the order. */
const FULFILMENT_COLUMN: Record<OrderStatus, ColumnStatus> = {
  new:                    { label: "New", group: "confirming" },
  brand_confirmed:        { label: "Confirm from brand", group: "confirming" },
  confirmation_pending:   { label: "Confirm from brand", group: "confirming" },
  customer_unreachable:   { label: "Confirm from brand", group: "confirming" },
  needs_amendment:        { label: "Amendment + addition", group: "brand" },
  confirmed:              { label: "Confirmed by Fulfilment", group: "brand" },
  cancelled:              { label: "Cancelled", group: "closed" },
  brand_preparing:        { label: "Confirmed by Fulfilment", group: "brand" },
  dispatched_to_hub:      { label: "Confirmed by Fulfilment", group: "hub" },
  received_at_hub:        { label: "Confirmed by Fulfilment", group: "hub" },
  hub_issue:              { label: "Hub issue", group: "problem" },
  ready_for_shipment:     { label: "Confirmed by Fulfilment", group: "hub" },
  assigned_to_shipment:   { label: "Confirmed by Fulfilment", group: "hub" },
  shipped:                { label: "In transit", group: "transit" },
  in_transit:             { label: "In transit", group: "transit" },
  customs:                { label: "In transit", group: "transit" },
  arrived_bd:             { label: "In transit", group: "transit" },
  received_by_partner:    { label: "Preparing for delivery", group: "transit" },
  preparing_for_delivery: { label: "Preparing for delivery", group: "transit" },
  out_for_delivery:       { label: "Out for delivery", group: "transit" },
  delivered:              { label: "Delivered", group: "done" },
  delivery_failed:        { label: "Delivery failed", group: "problem" },
  returned:               { label: "Returned", group: "problem" },
  hold:                   { label: "On hold", group: "problem" },
};

export function fulfilmentStatus(status: OrderStatus): ColumnStatus {
  return FULFILMENT_COLUMN[status];
}

/** Master column: the full end-to-end journey. */
const MASTER_COLUMN: Record<OrderStatus, ColumnStatus> = {
  new:                    { label: "New", group: "brand" },
  brand_confirmed:        { label: "Brand confirmed", group: "confirming" },
  confirmation_pending:   { label: "Fulfilment verified", group: "confirming" },
  customer_unreachable:   { label: "Fulfilment verified", group: "confirming" },
  needs_amendment:        { label: "Needs amendment", group: "brand" },
  confirmed:              { label: "Fulfilment verified", group: "brand" },
  cancelled:              { label: "Cancelled", group: "closed" },
  brand_preparing:        { label: "Fulfilment verified", group: "brand" },
  dispatched_to_hub:      { label: "Shipped to hub", group: "hub" },
  received_at_hub:        { label: "Received at hub", group: "hub" },
  hub_issue:              { label: "Hub issue", group: "problem" },
  ready_for_shipment:     { label: "Received at hub", group: "hub" },
  assigned_to_shipment:   { label: "Dispatched", group: "hub" },
  shipped:                { label: "Dispatched", group: "transit" },
  in_transit:             { label: "Dispatched", group: "transit" },
  customs:                { label: "Dispatched", group: "transit" },
  arrived_bd:             { label: "Arrived bd", group: "transit" },
  received_by_partner:    { label: "Arrived bd", group: "transit" },
  preparing_for_delivery: { label: "Arrived bd", group: "transit" },
  out_for_delivery:       { label: "Out for delivery", group: "transit" },
  delivered:              { label: "Delivered", group: "done" },
  delivery_failed:        { label: "Delivery failed", group: "problem" },
  returned:               { label: "Returned", group: "problem" },
  hold:                   { label: "On hold", group: "problem" },
};

export function masterStatus(status: OrderStatus): ColumnStatus {
  return MASTER_COLUMN[status];
}

/** Brand-side rules, mirroring the database (the database is still the authority). */
export const BRAND_EDITABLE: OrderStatus[] = ["new", "brand_confirmed", "confirmation_pending", "customer_unreachable", "needs_amendment", "confirmed", "brand_preparing"];
export const BRAND_CANCELLABLE: OrderStatus[] = BRAND_EDITABLE;
/** Orders are marked ready to ship (brand_preparing) before they can be dispatched to the hub. */
export const BRAND_READY_MARKABLE: OrderStatus[] = ["confirmed"];
export const BRAND_DISPATCHABLE: OrderStatus[] = ["brand_preparing"];

/** Statuses where the order is still with the brand, so the brand can move it. */
const BRAND_ACTORS: OrderStatus[] = ["new", "brand_confirmed", "confirmation_pending", "customer_unreachable", "needs_amendment", "confirmed", "brand_preparing"];

/**
 * Options in the brand's "Update status" dropdown (transitions granted in migrations 014 and 032).
 * "Confirmed" from New goes through the brand confirm flow (brand_confirmed); otherwise it's `confirmed`.
 */
export function brandStatusMoves(status: OrderStatus): { to: OrderStatus; label: string }[] {
  if (!BRAND_ACTORS.includes(status)) return [];
  const options: { to: OrderStatus; label: string }[] = [
    { to: "new", label: "New" },
    { to: status === "new" ? "brand_confirmed" : "confirmed", label: "Confirmed" },
    { to: "cancelled", label: "Cancelled" },
    { to: "confirmation_pending", label: "Pending" },
  ];
  return options.filter((m) => m.to !== status);
}

export type BulkActionKey = "new" | "brand_confirmed" | "confirmed" | "confirmation_pending" | "cancelled" | "ready" | "dispatch";
export interface BulkAction { key: BulkActionKey; label: string }

/** What the Orders page "Bulk action" menu offers for one order, based on its stage. */
export function bulkActionsFor(status: OrderStatus): BulkAction[] {
  const actions: BulkAction[] = [];
  if (BRAND_READY_MARKABLE.includes(status)) actions.push({ key: "ready", label: "Mark ready to ship" });
  if (BRAND_DISPATCHABLE.includes(status)) actions.push({ key: "dispatch", label: "Dispatch to hub" });
  for (const m of brandStatusMoves(status)) {
    actions.push({ key: m.to as BulkActionKey, label: m.to === "cancelled" ? "Cancel" : `Mark as ${m.label.toLowerCase()}` });
  }
  return actions;
}

/** Actions every one of the given orders allows, in a stable order. */
export function commonBulkActions(statuses: OrderStatus[]): BulkAction[] {
  if (statuses.length === 0) return [];
  const [first, ...rest] = statuses.map(bulkActionsFor);
  return first.filter((a) => rest.every((list) => list.some((b) => b.key === a.key)));
}

export const SHIPMENT_STATUS_LABEL: Record<ShipmentStatus, string> = {
  draft: "Being packed", ready_for_dispatch: "Ready to leave", handed_to_carrier: "Handed to carrier",
  in_transit: "In transit", customs: "In customs", arrived_bd: "Arrived at destination", received_by_partner: "With delivery partner",
};

export const INBOUND_STATUS: Record<InboundStatus, { label: string; group: StatusGroup }> = {
  in_transit: { label: "On the way to hub", group: "hub" },
  received: { label: "Received", group: "done" },
  issue: { label: "Items missing", group: "problem" },
};
