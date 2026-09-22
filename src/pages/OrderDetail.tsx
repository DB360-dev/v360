import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Ban, MessageSquare, PackageCheck, Pencil, Truck } from "lucide-react";
import { useActiveBrand } from "@/context/BrandContext";
import { useBrandConfirmOrder, useLatestFxRate, useMarkPreparing, useOrder, useOrderEvents } from "@/hooks/useData";
import { BRAND_CANCELLABLE, BRAND_DISPATCHABLE, BRAND_EDITABLE, INBOUND_STATUS, SHIPMENT_STATUS_LABEL, STATUS } from "@/lib/status";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/format";
import { neutralize } from "@/lib/neutral";
import type { OrderDetail as TOrder, OrderEvent, OrderStatus } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Pill, StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState, ErrorState, Spinner } from "@/components/ui/States";
import { JourneyRail } from "@/components/JourneyRail";
import { Timeline } from "@/components/Timeline";
import { OrderMessages } from "@/components/OrderMessages";
import { DispatchDialog } from "@/components/DispatchDialog";
import { EditOrderDialog } from "@/components/EditOrderDialog";
import { CancelOrderDialog } from "@/components/CancelOrderDialog";

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
  const [dialog, setDialog] = useState<"edit" | "dispatch" | "cancel" | null>(null);
  const [tab, setTab] = useState<"timeline" | "messages">("timeline");

  // FX rate: convert order currency → BDT (most common: PKR → BDT)
  // Fetched from the shared fx_rates table managed by the admin portal.
  const orderCurrency = (q.data?.currency ?? "PKR").toUpperCase();
  const fxQ = useLatestFxRate(orderCurrency, "BDT");
  const fxRate = fxQ.data?.rate ?? null;
  const fxDate = fxQ.data?.rate_date ?? null;

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
          {canEdit && <Button onClick={() => setDialog("edit")}><Pencil className="h-4 w-4" /> Edit details</Button>}
          {o.status === "confirmed" && (
            <Button loading={markPreparing.isPending} onClick={() => markPreparing.mutate([o.id])}><PackageCheck className="h-4 w-4" /> Mark preparing</Button>
          )}
          {canDispatch && <Button variant="primary" onClick={() => setDialog("dispatch")}><Truck className="h-4 w-4" /> Dispatch to hub</Button>}
          {BRAND_CANCELLABLE.includes(o.status) && (
            <Button variant="ghost" onClick={() => setDialog("cancel")} className="text-danger hover:text-danger"><Ban className="h-4 w-4" /> Cancel</Button>
          )}
        </div>
      </header>

      <Banners order={o} events={ev.data} />

      <div className="panel mb-6 px-3 py-5 sm:px-6"><JourneyRail status={o.status} previousStatus={o.previous_status} /></div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          <Section title="Items">
            <div className="-m-4 overflow-x-auto">
              <table className="w-full min-w-[520px] text-[13.5px]">
                <thead className="table-head"><tr><th>Product</th><th>SKU</th><th className="text-right">Qty</th><th className="text-right">Price</th>{atOrAfterHub && <th className="text-right">At hub</th>}</tr></thead>
                <tbody className="table-body">
                  {o.order_items.map((i) => {
                    const short = atOrAfterHub && i.received_quantity < i.quantity;
                    return (
                      <tr key={i.id}>
                        <td><div className="font-medium">{i.product_name}</div>{i.variant && <div className="text-[12.5px] text-muted">{i.variant}</div>}</td>
                        <td className="text-muted">{i.sku ?? "—"}</td>
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
                    {fxRate && o.subtotal ? <span className="text-[12.5px] text-muted">≈ {fmtMoney(o.subtotal * fxRate, "BDT")}</span> : null}
                  </span>],
                ["Discount", o.discount_total ? `−${fmtMoney(o.discount_total, o.currency)}` : "—"],
                ["Shipping", fmtMoney(o.shipping_total, o.currency)],
                ["Order total",
                  <span key="t" className="inline-flex flex-wrap items-baseline gap-2">
                    <strong>{fmtMoney(o.order_total, o.currency)}</strong>
                    {fxRate && o.order_total ? <span className="text-[12.5px] text-muted">≈ {fmtMoney(o.order_total * fxRate, "BDT")}</span> : null}
                  </span>],
                ["Cash to collect",
                  <span key="cod" className="inline-flex flex-wrap items-baseline gap-2">
                    {fmtMoney(o.cod_amount_expected, cod)}
                    {fxRate && o.cod_amount_expected ? <span className="text-[12.5px] text-muted">≈ {fmtMoney(o.cod_amount_expected * fxRate, "BDT")}</span> : null}
                  </span>],
                ["Cash collected", o.cod_amount_collected !== null
                  ? <span key="c" className={o.cod_amount_expected !== null && o.cod_amount_collected < o.cod_amount_expected ? "font-medium text-g-problem" : "font-medium"}>{fmtMoney(o.cod_amount_collected, cod)}</span>
                  : "Not yet"],
              ]} />
              {fxRate && fxDate && (
                <p className="mt-3 text-[11.5px] text-faint">
                  BDT figures use rate 1 {orderCurrency} = {fxRate} BDT (set {fxDate} by V360)
                </p>
              )}
              {!fxRate && orderCurrency !== "BDT" && !fxQ.isLoading && (
                <p className="mt-3 text-[11.5px] text-faint">
                  No {orderCurrency} → BDT rate set yet — contact the V360 team.
                </p>
              )}
            </Section>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Section title="Brand confirmation">
              <div className="space-y-3">
                {o.brand_confirmed_at ? (
                  <>
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-g-done-bg">
                        <svg className="h-3 w-3 text-g-done" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                      <span className="text-[13.5px] font-medium text-g-done">Confirmed by your team</span>
                    </div>
                    <p className="text-[12.5px] text-faint">{fmtDateTime(o.brand_confirmed_at)}</p>
                  </>
                ) : (
                  <>
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 cursor-pointer rounded border-line accent-primary"
                        checked={false}
                        disabled={brandConfirm.isPending}
                        onChange={() => brandConfirm.mutate()}
                      />
                      <span className="text-[13.5px] leading-snug">
                        <span className="font-medium">I confirm this order is correct</span>
                        <br />
                        <span className="text-faint">Tick this once you've verified the items and customer details. This is visible to the V360 team.</span>
                      </span>
                    </label>
                    {brandConfirm.isPending && <p className="text-[12.5px] text-muted">Saving…</p>}
                  </>
                )}
              </div>
            </Section>
            <Section title="Customer confirmation">
              <Facts rows={[
                ["Status", o.confirmed_at ? "Confirmed" : s.label],
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

        <aside className="xl:sticky xl:top-6 xl:self-start">
          <Section
            title=""
            aside={undefined}
          >
            {/* Tab bar */}
            <div className="-mx-4 -mt-4 mb-4 flex border-b border-line">
              {(["timeline", "messages"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-[13.5px] font-medium transition-colors ${
                    tab === t
                      ? "border-b-2 border-primary text-ink"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  {t === "messages" && <MessageSquare className="h-3.5 w-3.5" />}
                  {t === "timeline" ? "Timeline" : "Messages"}
                </button>
              ))}
            </div>
            {tab === "timeline"
              ? (ev.isLoading ? <Spinner /> : ev.isError ? <ErrorState error={ev.error} onRetry={() => ev.refetch()} /> : <Timeline events={ev.data!} />)
              : <OrderMessages orderId={o.id} />
            }
          </Section>
          <p className="mt-3 px-1 text-[12.5px] text-faint">Shopify order ID {o.shopify_order_id}. Imported {fmtDateTime(o.created_at)}.</p>
        </aside>
      </div>

      <EditOrderDialog order={o} open={dialog === "edit"} onClose={() => setDialog(null)} />
      <CancelOrderDialog order={o} open={dialog === "cancel"} onClose={() => setDialog(null)} />
      <DispatchDialog brandId={brand.id} orders={[o]} open={dialog === "dispatch"} onClose={() => setDialog(null)} />
    </>
  );
}
