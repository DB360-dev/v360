import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, ChevronDown, Pencil, Truck } from "lucide-react";
import { useActiveBrand } from "@/context/BrandContext";
import { useBrandConfirmOrder, useChangeOrderStatus, useLatestFxRate, useMarkPreparing, useOrder, useOrderEvents } from "@/hooks/useData";
import { BRAND_DISPATCHABLE, BRAND_EDITABLE, INBOUND_STATUS, SHIPMENT_STATUS_LABEL, STATUS } from "@/lib/status";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/format";
import { neutralize } from "@/lib/neutral";
import type { OrderDetail as TOrder, OrderEvent, OrderStatus } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Pill, StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState, ErrorState, Spinner } from "@/components/ui/States";
import { MasterRail } from "@/components/MasterRail";
import { OrderMessages } from "@/components/OrderMessages";
import { DispatchDialog } from "@/components/DispatchDialog";
import { EditOrderDialog } from "@/components/EditOrderDialog";
import { CancelOrderDialog } from "@/components/CancelOrderDialog";
import { StatusChangeDialog } from "@/components/StatusChangeDialog";

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="panel">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <h2>{title}</h2>{aside}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(110px,auto)_1fr] gap-x-4 gap-y-2 text-[13.5px]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="min-w-0 break-words">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

function latestNote(events: OrderEvent[] | undefined, status: OrderStatus): string | null {
  const note = events?.find((e) => e.to_status === status)?.note;
  return note ? neutralize(note) : null;
}

/** Brand-acting statuses this brand can move an order through while it's still at the brand. */
const BRAND_ACTORS: OrderStatus[] = ["new", "brand_confirmed", "confirmation_pending", "customer_unreachable", "needs_amendment", "confirmed", "brand_preparing"];
/** Targets the brand may set via change_order_status (granted in migration 014). */
const BRAND_TARGETS: OrderStatus[] = ["confirmation_pending", "customer_unreachable", "needs_amendment", "confirmed", "brand_preparing", "cancelled"];

/** Statuses this brand may move an order to right now, in order. Empty = no moves. */
const STATUS_MOVES: Record<OrderStatus, { to: OrderStatus; label: string }[]> = Object.fromEntries(
  Object.keys(STATUS).map((s) => {
    const status = s as OrderStatus;
    const moves = BRAND_ACTORS.includes(status)
      ? [
          ...(status === "new" ? [{ to: "brand_confirmed" as OrderStatus, label: "Brand confirmed" }] : []),
          ...BRAND_TARGETS.filter((t) => t !== status).map((t) => ({ to: t, label: STATUS[t].label })),
        ]
      : [];
    return [status, moves];
  }),
) as Record<OrderStatus, { to: OrderStatus; label: string }[]>;

function StatusMovesDropdown({ status, onPick, disabled }: {
  status: OrderStatus;
  onPick: (to: OrderStatus) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const moves = STATUS_MOVES[status] ?? [];
  if (moves.length === 0) return null;
  return (
    <div className="relative">
      <Button variant="primary" disabled={disabled} onClick={() => setOpen((v) => !v)}>
        Update status <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-30 mt-1 min-w-[180px] overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lg">
            {moves.map((m) => (
              <button
                key={m.to}
                onClick={() => { setOpen(false); onPick(m.to); }}
                className="block w-full px-3 py-2 text-left text-[13.5px] text-ink hover:bg-sunken"
              >
                {m.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Banner({ tone, title, children }: { tone: "brand" | "problem"; title: string; children?: ReactNode }) {
  const c = tone === "brand" ? "bg-g-brand-bg text-g-brand border-g-brand/30" : "bg-g-problem-bg text-g-problem border-g-problem/30";
  return (
    <div role="status" className={`mb-4 flex gap-3 rounded-lg border px-4 py-3 ${c}`}>
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <div className="text-[14px]"><p className="font-semibold">{title}</p>{children && <div className="mt-0.5 whitespace-pre-line">{children}</div>}</div>
    </div>
  );
}

function Banners({ order, events }: { order: TOrder; events?: OrderEvent[] }) {
  switch (order.status) {
    case "needs_amendment":
      return <Banner tone="brand" title="The customer asked for a change">{latestNote(events, "needs_amendment") ?? "Edit the order details so we can reconfirm with the customer."}</Banner>;
    case "hub_issue":
      return <Banner tone="problem" title="Items missing at the hub">{latestNote(events, "hub_issue") ?? "Send the missing items to the hub."}</Banner>;
    case "hold":
      return <Banner tone="problem" title="This order is on hold">{latestNote(events, "hold")}</Banner>;
    case "delivery_failed":
      return <Banner tone="problem" title="Delivery attempt failed">{neutralize(order.failure_reason)}</Banner>;
    case "cancelled":
      return <Banner tone="problem" title={order.shopify_cancelled_at ? "Cancelled in Shopify" : "Order cancelled"}>{latestNote(events, "cancelled")}</Banner>;
    default:
      return null;
  }
}

export function OrderDetail() {
  const { id = "" } = useParams();
  const { brand } = useActiveBrand();
  const q = useOrder(brand.id, id);
  const ev = useOrderEvents(brand.id, id);
  const markPreparing = useMarkPreparing(brand.id);
  const changeOrderStatus = useChangeOrderStatus(brand.id);
  const [dialog, setDialog] = useState<"edit" | "dispatch" | "cancel" | null>(null);
  const [statusTo, setStatusTo] = useState<OrderStatus | null>(null);

  // FX rate: the admin sets 1 PKR = N BDT in the shared fx_rates table.
  // PKR amounts convert to BDT; BDT amounts convert back to PKR.
  const fxQ = useLatestFxRate("PKR", "BDT");
  const fxRate = fxQ.data?.rate ?? null;
  const fxDate = fxQ.data?.rate_date ?? null;
  const fxApprox = (amount: number | null | undefined, currency: string | null | undefined): string | null => {
    if (!fxRate || !amount) return null;
    const c = (currency ?? "PKR").toUpperCase();
    if (c === "PKR") return fmtMoney(amount * fxRate, "BDT");
    if (c === "BDT") return fmtMoney(amount / fxRate, "PKR");
    return null;
  };

  // Brand confirmation — instantiate with a placeholder id; hook is guarded by enabled
  const brandConfirm = useBrandConfirmOrder(brand.id, id);

  if (q.isLoading) return <Spinner label="Loading order" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} title="This order didn't load" />;
  const o = q.data;
  if (!o) {
    return (
      <EmptyState title="Order not found" action={<Link to="/orders" className="link">Back to orders</Link>}>
        It may belong to a different brand, or the link is wrong.
      </EmptyState>
    );
  }

  const s = STATUS[o.status];
  const canEdit = BRAND_EDITABLE.includes(o.status);
  const canDispatch = BRAND_DISPATCHABLE.includes(o.status);
  const atOrAfterHub = !!o.received_at_hub_at || ["hub_issue", "received_at_hub"].includes(o.status);
  const cod = o.cod_currency ?? o.currency;

  return (
    <>
      <Link to="/orders" className="mb-4 inline-flex items-center gap-1.5 text-[13.5px] text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Orders
      </Link>

      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1>Order {o.order_number}</h1>
            <StatusBadge status={o.status} />
          </div>
          <p className="mt-1.5 max-w-2xl text-[14px] text-muted">{s.hint}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusMovesDropdown
            status={o.status}
            disabled={brandConfirm.isPending || markPreparing.isPending || changeOrderStatus.isPending}
            onPick={(to) => {
              if (to === "brand_confirmed") brandConfirm.mutate();
              else if (to === "brand_preparing") markPreparing.mutate([o.id]);
              else if (to === "cancelled") setDialog("cancel");
              else if (to === "needs_amendment") setStatusTo(to);
              else changeOrderStatus.mutate({ id: o.id, to });
            }}
          />
          {canEdit && <Button onClick={() => setDialog("edit")}><Pencil className="h-4 w-4" /> Edit details</Button>}
          {canDispatch && <Button variant="primary" onClick={() => setDialog("dispatch")}><Truck className="h-4 w-4" /> Dispatch to hub</Button>}
        </div>
      </header>

      <Banners order={o} events={ev.data} />

      <div className="panel mb-6 px-3 py-5 sm:px-6">
        <div className="mb-3 flex items-center gap-2 px-1">
          <h2 className="text-[12.5px] font-semibold uppercase tracking-wide text-muted">Master Status</h2>
          <span className="h-px flex-1 bg-line" />
        </div>
        {ev.isLoading ? <Spinner /> : ev.isError ? <ErrorState error={ev.error} onRetry={() => ev.refetch()} /> : <MasterRail status={o.status} previousStatus={o.previous_status} />}
      </div>

      <div className="min-w-0 space-y-6">
          <Section title="Items">
            <div className="-m-4 overflow-x-auto">
              <table className="w-full min-w-[520px] text-[13.5px]">
                <thead className="table-head"><tr><th>Product</th><th>SKU</th>{o.inbound_batch_id && <th>Fulfilled by</th>}<th className="text-right">Qty</th><th className="text-right">Price</th>{atOrAfterHub && <th className="text-right">At hub</th>}</tr></thead>
                <tbody className="table-body">
                  {o.order_items.map((i) => {
                    const short = atOrAfterHub && i.received_quantity < i.quantity;
                    const local = i.fulfillment_source === "bangladesh";
                    return (
                      <tr key={i.id}>
                        <td><div className="font-medium">{i.product_name}</div>{i.variant && <div className="text-[12.5px] text-muted">{i.variant}</div>}</td>
                        <td className="text-muted">{i.sku ?? "—"}</td>
                        {o.inbound_batch_id && (
                          <td className="whitespace-nowrap text-muted">
                            {local ? (
                              <span className="inline-flex items-center gap-1.5" title="Fulfilled from local inventory">
                                <span className="h-2 w-2 rounded-full bg-orange-500" aria-hidden /> Inventory
                              </span>
                            ) : "Pakistan"}
                          </td>
                        )}
                        <td className="text-right">{i.quantity}</td>
                        <td className="whitespace-nowrap text-right">{fmtMoney(i.unit_price, o.currency)}</td>
                        {atOrAfterHub && (
                          <td className={`text-right font-medium ${short ? "text-g-problem" : "text-g-done"}`}>
                            {i.received_quantity} of {i.quantity}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>

          <div className="grid gap-6 md:grid-cols-2">
            <Section title="Customer" aside={canEdit ? <button onClick={() => setDialog("edit")} className="link text-[13px]">Edit</button> : undefined}>
              <Facts rows={[
                ["Name", o.customer_name],
                ["Phone", o.customer_phone],
                ["Email", o.customer_email],
                ["Address", [o.address1, o.address2, o.city, o.province, o.zip].filter(Boolean).join(", ") || null],
                ["Note", o.customer_note],
              ]} />
            </Section>
            <Section title="Payment">
              <Facts rows={[
                ["Subtotal",
                  <span key="sub" className="inline-flex flex-wrap items-baseline gap-2">
                    {fmtMoney(o.subtotal, o.currency)}
                    {fxApprox(o.subtotal, o.currency) && <span className="text-[12.5px] text-muted">≈ {fxApprox(o.subtotal, o.currency)}</span>}
                  </span>],
                ["Discount", o.discount_total ? `−${fmtMoney(o.discount_total, o.currency)}` : "—"],
                ["Shipping", fmtMoney(o.shipping_total, o.currency)],
                ["Order total",
                  <span key="t" className="inline-flex flex-wrap items-baseline gap-2">
                    <strong>{fmtMoney(o.order_total, o.currency)}</strong>
                    {fxApprox(o.order_total, o.currency) && <span className="text-[12.5px] text-muted">≈ {fxApprox(o.order_total, o.currency)}</span>}
                  </span>],
                ["Cash to collect",
                  <span key="cod" className="inline-flex flex-wrap items-baseline gap-2">
                    {fmtMoney(o.cod_amount_expected, cod)}
                    {fxApprox(o.cod_amount_expected, cod) && <span className="text-[12.5px] text-muted">≈ {fxApprox(o.cod_amount_expected, cod)}</span>}
                  </span>],
                ["Cash collected", o.cod_amount_collected !== null
                  ? <span key="c" className={o.cod_amount_expected !== null && o.cod_amount_collected < o.cod_amount_expected ? "font-medium text-g-problem" : "font-medium"}>{fmtMoney(o.cod_amount_collected, cod)}</span>
                  : "Not yet"],
              ]} />
              {fxRate && fxDate && (
                <p className="mt-3 text-[11.5px] text-faint">
                  Converted figures use the rate 1 PKR = {fxRate} BDT (set {fxDate} by the admin team).
                </p>
              )}
              {!fxRate && !fxQ.isLoading && (
                <p className="mt-3 text-[11.5px] text-faint">
                  No PKR → BDT rate set yet — converted amounts aren't shown.
                </p>
              )}
            </Section>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Section title="Messages" aside={undefined}>
              <OrderMessages orderId={o.id} />
            </Section>
            <Section title="Fulfilment confirmation">
              <Facts rows={[
                ["Status", o.confirmed_at ? "Fulfilment confirmed" : (o.status === "brand_confirmed" ? "Waiting for the delivery partner" : s.label)],
                ["Confirmed", fmtDateTime(o.confirmed_at)],
                ["Call attempts", o.confirmation_attempts || "—"],
              ]} />
            </Section>
            <Section title="Your dispatch to hub">
              {o.inbound_batch ? (
                <Facts rows={[
                  ["Courier", o.inbound_batch.courier],
                  ["Tracking", o.inbound_batch.tracking_number],
                  ["Sent", fmtDate(o.inbound_batch.dispatch_date)],
                  ["Hub status", <Pill key="h" group={INBOUND_STATUS[o.inbound_batch.status].group} label={INBOUND_STATUS[o.inbound_batch.status].label} />],
                  ["Received", fmtDateTime(o.received_at_hub_at)],
                ]} />
              ) : <p className="text-[13.5px] text-muted">Not dispatched yet.</p>}
            </Section>
            <Section title="Shipment">
              {o.shipment ? (
                <Facts rows={[
                  ["Shipment", o.shipment.code],
                  ["Carrier", o.shipment.shipping_partner],
                  ["Tracking", o.shipment.tracking_number],
                  ["Status", SHIPMENT_STATUS_LABEL[o.shipment.status]],
                  ["Left hub", fmtDateTime(o.shipment.dispatched_at)],
                ]} />
              ) : <p className="text-[13.5px] text-muted">Not in a shipment yet.</p>}
            </Section>
            <Section title="Last-mile delivery">
              {o.delivery_tracking_number || o.delivered_at || o.failure_reason || o.shipment?.received_at ? (
                <Facts rows={[
                  ["With delivery partner", fmtDateTime(o.shipment?.received_at)],
                  ["Courier", o.delivery_courier],
                  ["Tracking", o.delivery_tracking_number],
                  ["Delivered", fmtDateTime(o.delivered_at)],
                  ...(o.failure_reason ? [["Failure reason", neutralize(o.failure_reason)] as [string, ReactNode]] : []),
                ]} />
              ) : <p className="text-[13.5px] text-muted">Not out for delivery yet.</p>}
            </Section>
          </div>
        </div>

        <p className="text-[12.5px] text-faint">Shopify order ID {o.shopify_order_id}. Imported {fmtDateTime(o.created_at)}.</p>

      <EditOrderDialog order={o} open={dialog === "edit"} onClose={() => setDialog(null)} />
      <CancelOrderDialog order={o} open={dialog === "cancel"} onClose={() => setDialog(null)} />
      <DispatchDialog brandId={brand.id} orders={[o]} open={dialog === "dispatch"} onClose={() => setDialog(null)} />
      {statusTo && <StatusChangeDialog order={o} to={statusTo} open={!!statusTo} onClose={() => setStatusTo(null)} />}
    </>
  );
}
