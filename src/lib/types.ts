export type OrderStatus =
  | "new" | "brand_confirmed" | "confirmation_pending" | "customer_unreachable" | "needs_amendment" | "confirmed" | "cancelled"
  | "brand_preparing" | "dispatched_to_hub" | "received_at_hub" | "hub_issue" | "ready_for_shipment"
  | "assigned_to_shipment" | "shipped" | "in_transit" | "customs" | "arrived_bd" | "received_by_partner"
  | "preparing_for_delivery" | "out_for_delivery" | "delivered" | "delivery_failed" | "returned" | "hold";

export type ShipmentStatus =
  | "draft" | "ready_for_dispatch" | "handed_to_carrier" | "in_transit" | "customs" | "arrived_bd" | "received_by_partner";

export type InboundStatus = "in_transit" | "received" | "issue";
export type MemberRole = "admin" | "operator" | "partner_agent" | "brand_owner" | "brand_staff";
export type OrgType = "v360" | "partner" | "brand";

export type ApprovalStatus = "pending" | "approved" | "rejected";
export interface Organization {
  id: string; name: string; type: OrgType; slug: string | null; is_active: boolean;
  approval_status: ApprovalStatus; review_note: string | null;
}
export interface Membership { role: MemberRole; organization: Organization }

export interface Order {
  id: string; brand_id: string; shopify_order_id: number; order_number: string; order_date: string;
  customer_name: string | null; customer_phone: string | null; customer_email: string | null;
  address1: string | null; address2: string | null; city: string | null; province: string | null; zip: string | null;
  country_code: string; currency: string; subtotal: number; discount_total: number; shipping_total: number;
  order_total: number; payment_status: string | null; cod_amount_expected: number | null;
  cod_amount_collected: number | null; cod_currency: string | null; customer_note: string | null; shopify_note: string | null;
  status: OrderStatus; previous_status: OrderStatus | null; status_changed_at: string; confirmation_attempts: number;
  confirmed_at: string | null; inbound_batch_id: string | null; received_at_hub_at: string | null; hub_notes: string | null;
  shipment_id: string | null; delivery_courier: string | null; delivery_tracking_number: string | null;
  delivered_at: string | null; failure_reason: string | null; return_disposition: string | null;
  shopify_cancelled_at: string | null; created_at: string;
  brand_confirmed_at: string | null; brand_confirmed_by: string | null;
}

export type FulfillmentSource = "pakistan" | "bangladesh";

export interface OrderItem {
  id: string; order_id: string; product_name: string; sku: string | null; variant: string | null;
  quantity: number; unit_price: number; discount: number; received_quantity: number;
  fulfillment_source: FulfillmentSource; inventory_qty: number;
}

/** A brand's stock already in the customer's country (local inventory). */
export interface InventoryItem {
  id: string; brand_id: string; sku: string; quantity_available: number; updated_at: string;
}

export interface InboundBatch {
  id: string; brand_id: string; courier: string; tracking_number: string | null; dispatch_date: string;
  status: InboundStatus; courier_status: string | null; notes: string | null; created_at: string; received_at: string | null;
}
export interface InboundBatchOverview extends InboundBatch {
  order_count: number; awaiting_count: number; issue_count: number; received_count: number;
}

export interface Shipment {
  id: string; code: string; shipping_partner: string | null; tracking_number: string | null;
  origin: string; destination: string; status: ShipmentStatus; dispatched_at: string | null; received_at: string | null;
}

export interface OrderDetail extends Order {
  order_items: OrderItem[];
  inbound_batch: InboundBatch | null;
  shipment: Shipment | null;
}

export interface OrderEvent {
  id: number; order_id: string; actor_label: string | null; action: string;
  from_status: OrderStatus | null; to_status: OrderStatus | null; note: string | null; created_at: string;
}

export interface OrderOverview {
  id: string; order_number: string; order_date: string; status: OrderStatus; status_changed_at: string;
  brand_id: string; brand_name: string; customer_name: string | null; customer_phone: string | null; city: string | null;
  order_total: number; currency: string; cod_amount_expected: number | null; cod_amount_collected: number | null;
  cod_currency: string | null; confirmation_attempts: number; inbound_courier: string | null; inbound_tracking: string | null;
  shipment_code: string | null; shipment_tracking: string | null; shipping_partner: string | null;
  delivery_courier: string | null; delivery_tracking_number: string | null; delivered_at: string | null; item_count: number;
  brand_confirmed_at: string | null;
}

export interface ShopifyConnection {
  id: string; brand_id: string; shop_domain: string; scopes: string | null; status: string;
  last_synced_at: string | null; installed_at: string | null;
}

export interface OrderMessage {
  id: number;
  order_id: string;
  sender_type: "brand" | "admin";
  sender_label: string;
  body: string;
  read_by_brand: boolean;
  read_by_admin: boolean;
  created_at: string;
}

export interface FxRate {
  id: number;
  rate_date: string;
  base: string;    // e.g. "PKR"
  quote: string;   // e.g. "BDT"
  rate: number;    // 1 PKR = rate BDT
  note: string | null;
  created_at: string;
}

export type InvoicePaymentStatus = "not_paid" | "partially_paid" | "paid";

export interface ShippingInvoiceLine {
  id: number; invoice_id: string; order_id: string; order_number: string; customer_name: string | null;
  items_summary: string | null; pk_units: number; bd_units: number; weight_kg: number; amount_pkr: number;
}

/** V360's shipping charges to the brand for one shipment — Pakistan-fulfilled units only. */
export interface ShippingInvoice {
  id: string; invoice_number: string; shipment_id: string; brand_id: string;
  order_count: number; pk_units: number; bd_units: number; weight_kg: number;
  freight_bdt_per_kg: number; fx_rate: number; fx_rate_date: string; amount_pkr: number;
  payment_status: InvoicePaymentStatus; paid_at: string | null; created_at: string;
  shipment?: { code: string; shipping_partner: string | null; tracking_number: string | null; dispatched_at: string | null } | null;
}
