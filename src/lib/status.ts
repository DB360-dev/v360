import type { InboundStatus, OrderStatus, ShipmentStatus } from "./types";

/** Who needs to act next — drives badge colour everywhere. */
export type StatusGroup = "brand" | "confirming" | "hub" | "transit" | "done" | "problem" | "closed";

export const STATUS: Record<OrderStatus, { label: string; group: StatusGroup; hint: string }> = {
  new:                    { label: "New", group: "confirming", hint: "Our team will call the customer to confirm this order." },
  confirmation_pending:   { label: "Confirmation pending", group: "confirming", hint: "Our team is confirming this order with the customer." },
  customer_unreachable:   { label: "Customer unreachable", group: "confirming", hint: "We couldn't reach the customer yet and will try again." },
  needs_amendment:        { label: "Needs amendment", group: "brand", hint: "The customer asked for a change. Update the order details so we can reconfirm." },
  confirmed:              { label: "Confirmed", group: "brand", hint: "The customer confirmed. Prepare the items and dispatch them to the hub." },
  cancelled:              { label: "Cancelled", group: "closed", hint: "This order was cancelled." },
  brand_preparing:        { label: "Preparing", group: "brand", hint: "You're preparing this order. Dispatch it to the hub when it's packed." },
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

/** Tabs on the Orders page, in order. "Needs your action" comes first. */
export const ORDER_TABS: { key: string; label: string; statuses: OrderStatus[] | null }[] = [
  { key: "action", label: "Needs your action", statuses: ["needs_amendment", "confirmed", "brand_preparing", "hub_issue"] },
  { key: "confirming", label: "Confirming", statuses: ["new", "confirmation_pending", "customer_unreachable"] },
  { key: "hub", label: "At hub", statuses: ["dispatched_to_hub", "received_at_hub", "ready_for_shipment", "assigned_to_shipment"] },
  { key: "transit", label: "On the way", statuses: ["shipped", "in_transit", "customs", "arrived_bd", "received_by_partner", "preparing_for_delivery", "out_for_delivery"] },
  { key: "delivered", label: "Delivered", statuses: ["delivered"] },
  { key: "attention", label: "Needs attention", statuses: ["delivery_failed", "returned", "hold"] },
  { key: "cancelled", label: "Cancelled", statuses: ["cancelled"] },
  { key: "all", label: "All", statuses: null },
];

/** The journey rail: six legs every order travels. */
export const JOURNEY: { key: string; label: string; statuses: OrderStatus[] }[] = [
  { key: "confirm", label: "Confirm", statuses: ["new", "confirmation_pending", "customer_unreachable", "needs_amendment"] },
  { key: "prepare", label: "Prepare", statuses: ["confirmed", "brand_preparing"] },
  { key: "hub", label: "Hub", statuses: ["dispatched_to_hub", "received_at_hub", "hub_issue", "ready_for_shipment", "assigned_to_shipment"] },
  { key: "shipment", label: "In transit", statuses: ["shipped", "in_transit", "customs", "arrived_bd"] },
  { key: "bd", label: "Last mile", statuses: ["received_by_partner", "preparing_for_delivery", "out_for_delivery", "delivery_failed", "returned"] },
  { key: "delivered", label: "Delivered", statuses: ["delivered"] },
];

export function journeyIndex(status: OrderStatus): number {
  return JOURNEY.findIndex((leg) => leg.statuses.includes(status));
}

/** Brand-side rules, mirroring the database (the database is still the authority). */
export const BRAND_EDITABLE: OrderStatus[] = ["new", "confirmation_pending", "customer_unreachable", "needs_amendment", "confirmed", "brand_preparing"];
export const BRAND_CANCELLABLE: OrderStatus[] = BRAND_EDITABLE;
export const BRAND_DISPATCHABLE: OrderStatus[] = ["confirmed", "brand_preparing"];

export const SHIPMENT_STATUS_LABEL: Record<ShipmentStatus, string> = {
  draft: "Being packed", ready_for_dispatch: "Ready to leave", handed_to_carrier: "Handed to carrier",
  in_transit: "In transit", customs: "In customs", arrived_bd: "Arrived at destination", received_by_partner: "With delivery partner",
};

export const INBOUND_STATUS: Record<InboundStatus, { label: string; group: StatusGroup }> = {
  in_transit: { label: "On the way to hub", group: "hub" },
  received: { label: "Received", group: "done" },
  issue: { label: "Items missing", group: "problem" },
};
