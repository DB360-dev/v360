import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { describeError, describeFunctionError } from "@/lib/errors";
import type {
  FxRate, InboundBatchOverview, InventoryItem, Order, OrderDetail, OrderEvent, OrderItem,
  OrderInternalNote, OrderMessage, OrderOverview, OrderStatus, ShippingInvoice, ShippingInvoiceLine, ShopifyConnection,
} from "@/lib/types";
import { plural } from "@/lib/format";

export const PAGE_SIZE = 50;

/** Every query key starts with the brand so switching brands never shows stale data. */
export const keys = {
  all: (brandId: string) => ["brand", brandId] as const,
  counts: (brandId: string) => ["brand", brandId, "counts"] as const,
  orders: (brandId: string, p: object) => ["brand", brandId, "orders", p] as const,
  order: (brandId: string, id: string) => ["brand", brandId, "order", id] as const,
  events: (brandId: string, id: string) => ["brand", brandId, "events", id] as const,
  ready: (brandId: string) => ["brand", brandId, "ready"] as const,
  batches: (brandId: string) => ["brand", brandId, "batches"] as const,
  batchOrders: (brandId: string, id: string) => ["brand", brandId, "batch", id] as const,
  activity: (brandId: string) => ["brand", brandId, "activity"] as const,
  attention: (brandId: string) => ["brand", brandId, "attention"] as const,
  inventory: (brandId: string) => ["brand", brandId, "inventory"] as const,
  localOrders: (brandId: string) => ["brand", brandId, "localOrders"] as const,
  inventoryOrders: (brandId: string) => ["brand", brandId, "inventoryOrders"] as const,
  dispatchItems: (brandId: string, ids: string) => ["brand", brandId, "dispatchItems", ids] as const,
  shopify: (brandId: string) => ["brand", brandId, "shopify"] as const,
  messages: (brandId: string, orderId: string) => ["brand", brandId, "messages", orderId] as const,
  internalNote: (brandId: string, orderId: string) => ["brand", brandId, "internalNote", orderId] as const,
  shippingInvoices: (brandId: string) => ["brand", brandId, "shippingInvoices"] as const,
  shippingInvoiceLines: (brandId: string, id: string) => ["brand", brandId, "shippingInvoiceLines", id] as const,
};

// ---------------------------------------------------------------- queries

export function useStatusCounts(brandId: string) {
  return useQuery({
    queryKey: keys.counts(brandId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("brand_order_counts", { p_brand_id: brandId });
      if (error) throw error;
      const map = {} as Partial<Record<OrderStatus, number>>;
      for (const row of (data ?? []) as { status: OrderStatus; count: number }[]) map[row.status] = Number(row.count);
      return map;
    },
  });
}

export interface OrderFilters { statuses: OrderStatus[] | null; search: string; from: string; to: string; page: number }

/** Strip characters that would break PostgREST's or() filter syntax. */
const cleanSearch = (s: string) => s.replace(/[,()*%\\:"']/g, " ").trim();

export function useOrders(brandId: string, f: OrderFilters) {
  return useQuery({
    queryKey: keys.orders(brandId, f),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase.from("order_overview").select("*", { count: "exact" }).eq("brand_id", brandId);
      if (f.statuses) q = q.in("status", f.statuses);
      const s = cleanSearch(f.search);
      if (s) q = q.or(`order_number.ilike.*${s}*,customer_name.ilike.*${s}*,customer_phone.ilike.*${s}*,city.ilike.*${s}*`);
      if (f.from) q = q.gte("order_date", f.from);
      if (f.to) q = q.lt("order_date", new Date(new Date(f.to).getTime() + 86400000).toISOString());
      const start = f.page * PAGE_SIZE;
      const { data, error, count } = await q.order("order_date", { ascending: false }).range(start, start + PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: (data ?? []) as OrderOverview[], total: count ?? 0 };
    },
  });
}

export function useOrder(brandId: string, id: string) {
  return useQuery({
    queryKey: keys.order(brandId, id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(*), inbound_batch:inbound_batches(*), shipment:shipments(id, code, shipping_partner, tracking_number, origin, destination, status, dispatched_at, received_at)")
        .eq("id", id)
        .eq("brand_id", brandId)
        .maybeSingle();
      if (error) throw error;
      if (data) (data as OrderDetail).order_items.sort((a: OrderItem, b: OrderItem) => a.product_name.localeCompare(b.product_name));
      return data as OrderDetail | null;
    },
  });
}

export function useOrderEvents(brandId: string, orderId: string) {
  return useQuery({
    queryKey: keys.events(brandId, orderId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_events").select("*").eq("order_id", orderId).order("id", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OrderEvent[];
    },
  });
}

export type ReadyOrder = Order & { order_items: OrderItem[] };

export function useReadyToSend(brandId: string) {
  return useQuery({
    queryKey: keys.ready(brandId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders").select("*, order_items(*)")
        .eq("brand_id", brandId).in("status", ["confirmed", "brand_preparing"])
        .order("confirmed_at", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as ReadyOrder[];
    },
  });
}

/** The brand's local (already in country) inventory, read for the dispatch dialog and the Local stock page. */
export function useInventory(brandId: string) {
  return useQuery({
    queryKey: keys.inventory(brandId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brand_inventory")
        .select("*")
        .eq("brand_id", brandId)
        .order("sku");
      if (error) throw error;
      return (data ?? []) as InventoryItem[];
    },
  });
}

/** Order items for the orders being dispatched (so the dialog can list every line). */
export function useDispatchItems(brandId: string, orderIds: string[]) {
  const ids = orderIds.slice().sort().join(",");
  return useQuery({
    queryKey: keys.dispatchItems(brandId, ids),
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, order_items(*)")
        .in("id", orderIds)
        .order("order_number");
      if (error) throw error;
      return (data ?? []) as { id: string; order_number: string; order_items: OrderItem[] }[];
    },
  });
}

export function useUpsertInventory(brandId: string, opts?: ActionOptions) {
  return useBrandAction(
    brandId,
    (v: { sku: string; quantity: number }) =>
      rpc<null>("upsert_inventory", { p_brand_id: brandId, p_sku: v.sku, p_quantity: v.quantity }),
    () => "Local stock saved",
    opts,
  );
}

export function useRemoveInventory(brandId: string, opts?: ActionOptions) {
  return useBrandAction(
    brandId,
    (sku: string) => rpc<null>("delete_inventory", { p_brand_id: brandId, p_sku: sku }),
    (sku) => `Removed ${sku}`,
    opts,
  );
}

export interface RestockedItem {
  order_item_id: string; order_id: string; order_number: string; order_date: string;
  status: OrderStatus; returned_at: string | null; brand_id: string; brand_name: string;
  customer_name: string | null; city: string | null; order_total: number; currency: string;
  return_disposition: string | null; restocked_at: string | null; restock_note: string | null;
  product_name: string; sku: string | null; variant: string | null;
  quantity: number; dispatched_qty: number; available_qty: number;
  unit_price: number; discount: number; line_total: number;
}

export interface InventoryOrder {
  brand_id: string; brand_name: string; order_id: string; order_number: string; order_date: string;
  customer_name: string | null; city: string | null; status: OrderStatus;
  order_item_id: string; product_name: string; sku: string | null; variant: string | null;
  inventory_qty: number; quantity: number;
}

/** The brand's own order lines that are in local inventory, i.e. restocked in the country. */
export function useRestockedOrders(brandId: string) {
  return useQuery({
    queryKey: keys.localOrders(brandId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bd_restocked_items")
        .select("*")
        .eq("brand_id", brandId)
        .order("restocked_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as RestockedItem[];
    },
  });
}

/** Orders that fulfilled one or more items from local BD inventory. */
export function useInventoryOrders(brandId: string) {
  return useQuery({
    queryKey: keys.inventoryOrders(brandId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brand_inventory_usage")
        .select("*")
        .eq("brand_id", brandId)
        .order("order_date", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as InventoryOrder[];
    },
  });
}

export function useNeedsAttention(brandId: string) {
  return useQuery({
    queryKey: keys.attention(brandId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_overview").select("*").eq("brand_id", brandId)
        .in("status", ["new", "needs_amendment", "hub_issue", "confirmed", "brand_preparing"])
        .order("status_changed_at", { ascending: true }).limit(8);
      if (error) throw error;
      return (data ?? []) as OrderOverview[];
    },
  });
}

export type ActivityEvent = OrderEvent & { order: { order_number: string; brand_id: string } };

export function useRecentActivity(brandId: string) {
  return useQuery({
    queryKey: keys.activity(brandId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_events").select("*, order:orders!inner(order_number, brand_id)")
        .eq("order.brand_id", brandId).order("id", { ascending: false }).limit(50);
      if (error) throw error;
      return (data ?? []) as ActivityEvent[];
    },
  });
}

export function useInboundBatches(brandId: string) {
  return useQuery({
    queryKey: keys.batches(brandId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inbound_batch_overview").select("*").eq("brand_id", brandId)
        .order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []) as InboundBatchOverview[];
    },
  });
}

export function useShippingInvoices(brandId: string) {
  return useQuery({
    queryKey: keys.shippingInvoices(brandId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brand_shipping_invoices")
        .select("*, shipment:shipments(code, shipping_partner, tracking_number, dispatched_at)")
        .eq("brand_id", brandId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ShippingInvoice[];
    },
  });
}

export function useShippingInvoiceLines(brandId: string, invoiceId: string | null) {
  return useQuery({
    queryKey: keys.shippingInvoiceLines(brandId, invoiceId ?? "none"),
    enabled: !!invoiceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brand_shipping_invoice_lines").select("*").eq("invoice_id", invoiceId!).order("order_number");
      if (error) throw error;
      return (data ?? []) as ShippingInvoiceLine[];
    },
  });
}

export function useBatchOrders(brandId: string, batchId: string | null) {
  return useQuery({
    queryKey: keys.batchOrders(brandId, batchId ?? "none"),
    enabled: !!batchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_overview").select("*").eq("brand_id", brandId).eq("inbound_batch_id", batchId!)
        .order("order_number");
      if (error) throw error;
      return (data ?? []) as OrderOverview[];
    },
  });
}

export function useShopifyConnection(brandId: string) {
  return useQuery({
    queryKey: keys.shopify(brandId),
    queryFn: async () => {
      // Column list is explicit: the Vault secret id is not readable from the browser.
      const { data, error } = await supabase
        .from("shopify_connections")
        .select("id, brand_id, shop_domain, scopes, status, last_synced_at, installed_at")
        .eq("brand_id", brandId).maybeSingle();
      if (error) throw error;
      return data as ShopifyConnection | null;
    },
  });
}

// -------------------------------------------------------------- mutations

/** Shared wrapper: success toast, readable error toast, refresh this brand's data. */
export interface ActionOptions {
  /** Inside a dialog: the dialog shows the error itself (toasts sit behind the dialog backdrop). */
  inlineErrors?: boolean;
}

function useBrandAction<TVars, TResult>(
  brandId: string,
  fn: (v: TVars) => Promise<TResult>,
  success: (r: TResult, v: TVars) => string,
  opts: ActionOptions = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r, v) => { toast.success(success(r, v)); },
    onError: (e) => { if (!opts.inlineErrors) toast.error(describeError(e)); },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.all(brandId) }),
  });
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as T;
}

export function useMarkPreparing(brandId: string, opts?: ActionOptions) {
  return useBrandAction(
    brandId,
    (ids: string[]) => rpc<number>("brand_mark_preparing", { p_order_ids: ids }),
    (n) => (n === 0 ? "Already marked ready to ship" : `${plural(n, "order")} marked ready to ship`),
    opts,
  );
}

/**
 * Moves several orders at once. Each order is moved on its own, so one refusal doesn't stop the rest;
 * the toast says how many moved and how many didn't.
 */
export function useBulkStatusChange(brandId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { ids: string[]; to: OrderStatus; note?: string | null }) => {
      if (v.to === "brand_preparing") {
        const n = await rpc<number>("brand_mark_preparing", { p_order_ids: v.ids });
        return { ok: n, failed: [] as string[] };
      }
      const results = await Promise.allSettled(v.ids.map((id) =>
        v.to === "brand_confirmed"
          ? rpc<void>("brand_confirm_order", { p_order_id: id })
          : rpc<null>("change_order_status", { p_order_id: id, p_to: v.to, p_note: v.note?.trim() || null })));
      const failed = results.flatMap((r) => (r.status === "rejected" ? [describeError(r.reason)] : []));
      return { ok: results.length - failed.length, failed };
    },
    onSuccess: ({ ok, failed }) => {
      if (ok > 0) toast.success(`${plural(ok, "order")} updated`);
      if (failed.length > 0) toast.error(`${plural(failed.length, "order")} couldn't be updated: ${[...new Set(failed)].join("; ")}`);
    },
    onError: (e) => toast.error(describeError(e)),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.all(brandId) }),
  });
}

export function useBrandConfirmOrder(brandId: string, orderId: string, opts?: ActionOptions) {
  return useBrandAction(
    brandId,
    () => rpc<void>("brand_confirm_order", { p_order_id: orderId }),
    () => "Order marked as brand confirmed",
    opts,
  );
}

export interface DispatchInput {
  orderIds: string[]; courier: string; tracking: string; date: string; notes: string;
  /** Per order_item id → how many units come from BD local inventory (0 = all from Pakistan). */
  itemSources?: Record<string, number>;
}

export function useDispatch(brandId: string, opts?: ActionOptions) {
  return useBrandAction(
    brandId,
    (v: DispatchInput) => rpc<string>("create_inbound_batch", {
      p_order_ids: v.orderIds, p_courier: v.courier.trim(), p_tracking_number: v.tracking.trim() || null,
      p_dispatch_date: v.date, p_notes: v.notes.trim() || null,
      p_item_sources: v.itemSources && Object.keys(v.itemSources).length ? v.itemSources : null,
    }),
    (_r, v) => `${plural(v.orderIds.length, "order")} dispatched to the hub`,
    opts,
  );
}

export function useUpdateOrder(brandId: string, opts?: ActionOptions) {
  return useBrandAction(
    brandId,
    (v: { id: string; changes: Record<string, string> }) => rpc<null>("brand_update_order", { p_order_id: v.id, p_changes: v.changes }),
    () => "Order details saved",
    opts,
  );
}

export function useCancelOrder(brandId: string, opts?: ActionOptions) {
  return useBrandAction(
    brandId,
    (v: { id: string; reason: string }) => rpc<null>("change_order_status", { p_order_id: v.id, p_to: "cancelled", p_note: v.reason.trim() }),
    () => "Order cancelled",
    opts,
  );
}

/** Generic status move via change_order_status (reason handled by caller if the target requires one). */
export function useChangeOrderStatus(brandId: string, opts?: ActionOptions) {
  return useBrandAction(
    brandId,
    (v: { id: string; to: OrderStatus; note?: string | null }) =>
      rpc<null>("change_order_status", { p_order_id: v.id, p_to: v.to, p_note: v.note?.trim() || null }),
    (_r, v) => `Order moved to ${v.to.replace(/_/g, " ")}`,
    opts,
  );
}

export function useUpdateBatch(brandId: string, opts?: ActionOptions) {
  return useBrandAction(
    brandId,
    async (v: { id: string; courier: string; tracking: string; notes: string }) => {
      const { error } = await supabase.from("inbound_batches")
        .update({ courier: v.courier.trim(), tracking_number: v.tracking.trim() || null, notes: v.notes.trim() || null })
        .eq("id", v.id).select("id").single();
      if (error) throw error;
    },
    () => "Dispatch updated",
    opts,
  );
}

export interface ShopifyKeysInput { shop: string; clientId: string; clientSecret: string }

/**
 * Connects the brand's own Shopify app. If the app isn't installed yet, the server returns
 * Shopify's install screen and we go there; Shopify then brings the brand back to Settings.
 * Errors are shown inline by the form, not toasted.
 */
export function useConnectShopify(brandId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: ShopifyKeysInput) => {
      const { data, error } = await supabase.functions.invoke("shopify-connect", {
        body: { brand_id: brandId, shop: v.shop, client_id: v.clientId.trim(), client_secret: v.clientSecret.trim() },
      });
      if (error) throw new Error(await describeFunctionError(error));
      return (data ?? {}) as { install_url?: string };
    },
    onSuccess: (r) => {
      if (r.install_url) window.location.assign(r.install_url);
      else toast.success("Shopify connected. New orders will appear automatically.");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.all(brandId) }),
  });
}

export function useDisconnectShopify(brandId: string) {
  return useBrandAction(
    brandId,
    () => rpc<void>("disconnect_shopify", { p_brand_id: brandId }),
    () => "Shopify store disconnected. New orders will stop coming in.",
  );
}

export interface ShopifySyncResult {
  fetched: number; created: number; updated: number; cancelled: number;
  skipped: number; unchanged: number; flagged: number; errors: number;
}

export function useSyncShopify(brandId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("shopify-sync", { body: { brand_id: brandId } });
      if (error) throw new Error(await describeFunctionError(error));
      return data as ShopifySyncResult;
    },
    onSuccess: (r) => {
      const bits: string[] = [];
      if (r.created) bits.push(`${plural(r.created, "new order")}`);
      if (r.updated) bits.push(`${plural(r.updated, "update")}`);
      if (r.cancelled) bits.push(`${plural(r.cancelled, "cancellation")}`);
      toast.success(bits.length ? `Shopify sync finished: ${bits.join(", ")}.` : "Shopify is up to date. No new order changes.");
    },
    onError: (e) => { toast.error(describeError(e)); },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.all(brandId) }),
  });
}

export function useImportOrders(brandId: string, opts?: ActionOptions) {
  return useBrandAction(
    brandId,
    async (parsedOrders: import("@/lib/csvParser").ParsedCsvOrder[]) => {
      let createdCount = 0;
      for (const ord of parsedOrders) {
        const { error } = await supabase.rpc("brand_import_order", {
          p_brand_id: brandId,
          p_order_number: ord.order_number,
          p_order_date: ord.order_date || new Date().toISOString(),
          p_customer_name: ord.customer_name || "Manual Customer",
          p_customer_phone: ord.customer_phone || null,
          p_customer_email: ord.customer_email || null,
          p_address1: ord.address1 || null,
          p_address2: ord.address2 || null,
          p_city: ord.city || "Dhaka",
          p_province: ord.province || null,
          p_zip: ord.zip || null,
          p_country_code: ord.country_code || "BD",
          p_currency: ord.currency || "BDT",
          p_subtotal: ord.subtotal ?? ord.order_total,
          p_discount_total: ord.discount_total ?? 0,
          p_shipping_total: ord.shipping_total ?? 0,
          p_order_total: ord.order_total,
          p_cod_amount: ord.cod_amount_expected ?? ord.order_total,
          p_cod_currency: ord.cod_currency || "BDT",
          p_items: ord.items.map((it) => ({
            product_name: it.product_name,
            sku: it.sku ?? null,
            variant: it.variant ?? null,
            quantity: it.quantity,
            unit_price: it.unit_price,
            discount: it.discount ?? 0,
          })),
        });
        if (error) throw error;
        createdCount++;
      }
      return createdCount;
    },
    (n) => `${plural(n, "order")} imported successfully`,
    opts,
  );
}

export function useOrderMessages(brandId: string, orderId: string) {
  return useQuery({
    queryKey: keys.messages(brandId, orderId),
    enabled: !!orderId,
    refetchInterval: 15_000,   // poll every 15 s for new messages
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_messages")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as OrderMessage[];
    },
  });
}

export function useSendMessage(brandId: string, orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      const { error } = await supabase.rpc("send_order_message", { p_order_id: orderId, p_body: body });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.messages(brandId, orderId) });
      qc.invalidateQueries({ queryKey: ["brand", brandId, "orders"] });
    },
    onError: (e) => toast.error(describeError(e)),
  });
}

export function useOrderInternalNote(brandId: string, orderId: string) {
  return useQuery({
    queryKey: keys.internalNote(brandId, orderId),
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_internal_notes")
        .select("order_id, role, note, updated_at, updated_by")
        .eq("order_id", orderId)
        .eq("role", "brand")
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as OrderInternalNote | null;
    },
  });
}

export function useSaveOrderInternalNote(brandId: string, orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (note: string) => {
      const { data: user } = await supabase.auth.getUser();
      const { error } = await supabase.from("order_internal_notes").upsert({
        order_id: orderId, role: "brand", note,
        updated_at: new Date().toISOString(), updated_by: user.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Note saved");
      qc.invalidateQueries({ queryKey: ["brand", brandId, "orders"] });
    },
    onError: (e) => toast.error(describeError(e)),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.internalNote(brandId, orderId) }),
  });
}

export function useMarkMessagesRead(brandId: string, orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("mark_messages_read", { p_order_id: orderId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.messages(brandId, orderId) }),
  });
}

/**
 * Fetches the most recent FX rate for a currency pair (e.g. base=PKR, quote=BDT).
 * Brands can read fx_rates (the admin panel writes them).
 */
export function useLatestFxRate(base: string, quote: string) {
  return useQuery({
    queryKey: ["fx", base.toUpperCase(), quote.toUpperCase()],
    staleTime: 5 * 60_000,   // reuse for 5 min
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fx_rates")
        .select("*")
        .eq("base", base.toUpperCase())
        .eq("quote", quote.toUpperCase())
        .order("rate_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as FxRate | null;
    },
  });
}
