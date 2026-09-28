import type { OrderStatus } from "./types";

/** Every permission a brand role can grant. Mirrors the brand entries in the `permissions` table. */
export type BrandPerm =
  | "orders.view" | "orders.view_money" | "orders.cancel" | "orders.edit_customer" | "orders.messages"
  | "orders.internal_notes" | "orders.confirm" | "orders.prepare" | "orders.import"
  | "dispatch.view" | "dispatch.create"
  | "inventory.view" | "inventory.manage"
  | "invoices.view" | "money.view" | "activity.view" | "shopify.manage"
  | "reports.order_register" | "reports.confirmations" | "reports.packing_list" | "reports.brand_dispatches"
  | "reports.bd_discrepancies" | "reports.delivery_performance" | "reports.returns" | "reports.sku_sales"
  | "reports.stock" | "reports.brand_payables" | "reports.shipping_charges" | "reports.cod_collection"
  | "reports.users_access";

/** Permission a brand status move needs (the database checks the same). */
export function brandTransitionPerm(to: OrderStatus): BrandPerm {
  if (to === "cancelled") return "orders.cancel";
  if (to === "new" || to === "brand_confirmed") return "orders.confirm";
  return "orders.prepare";
}
