import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, PackageCheck, Printer, Truck } from "lucide-react";
import { useActiveBrand } from "@/context/BrandContext";
import { useMarkPreparing, useReadyToSend, type ReadyOrder } from "@/hooks/useData";
import { fmtShort, plural, since } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { EmptyState, ErrorState, Spinner } from "@/components/ui/States";
import { DispatchDialog } from "@/components/DispatchDialog";

type PrintMode = "order" | "product";

interface ProductLine {
  key: string; product_name: string; variant: string | null; sku: string | null; quantity: number;
  orders: { order_number: string; quantity: number }[];
}

/** Every item across the given orders, merged by SKU + variant (or name + variant), with the orders that need it. */
function byProduct(orders: ReadyOrder[]): ProductLine[] {
  const lines = new Map<string, ProductLine>();
  for (const o of orders) {
    for (const i of o.order_items) {
      const key = `${(i.sku ?? i.product_name).trim().toLowerCase()}|${(i.variant ?? "").trim().toLowerCase()}`;
      const line = lines.get(key) ?? { key, product_name: i.product_name, variant: i.variant, sku: i.sku, quantity: 0, orders: [] };
      line.quantity += i.quantity;
      const existing = line.orders.find((x) => x.order_number === o.order_number);
      if (existing) existing.quantity += i.quantity;
      else line.orders.push({ order_number: o.order_number, quantity: i.quantity });
      lines.set(key, line);
    }
  }
  return [...lines.values()].sort((a, b) => (a.sku ?? a.product_name).localeCompare(b.sku ?? b.product_name, undefined, { numeric: true }));
}

function PrintMenu({ onPick }: { onPick: (mode: PrintMode) => void }) {
  const [open, setOpen] = useState(false);
  const pick = (mode: PrintMode) => { setOpen(false); onPick(mode); };
  return (
    <div className="relative print:hidden">
      <Button onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}>
        <Printer className="h-4 w-4" /> Print packing list <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-0 z-30 mt-1 w-64 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lg">
            <button role="menuitem" onClick={() => pick("order")} className="block w-full px-3 py-2 text-left hover:bg-sunken">
              <span className="block text-[13.5px] text-ink">By order</span>
              <span className="block text-[12px] text-muted">Each order with its items, for packing parcels</span>
            </button>
            <button role="menuitem" onClick={() => pick("product")} className="block w-full px-3 py-2 text-left hover:bg-sunken">
              <span className="block text-[13.5px] text-ink">By product</span>
              <span className="block text-[12px] text-muted">Total quantity of each product, for picking stock</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Packing list of every confirmed order, ready to prepare and send to the hub. */
export function Dispatch() {
  const { brand } = useActiveBrand();
  const q = useReadyToSend(brand.id);
  const markPreparing = useMarkPreparing(brand.id);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dispatchOpen, setDispatchOpen] = useState(false);

  const orders = q.data ?? [];
  const selectedOrders = useMemo(() => orders.filter((o) => selected.has(o.id)), [orders, selected]);
  const allSelected = orders.length > 0 && selected.size === orders.length;
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const confirmedSel = selectedOrders.filter((o) => o.status === "confirmed");
  const readySel = selectedOrders.filter((o) => o.status === "brand_preparing");
  const [printMode, setPrintMode] = useState<PrintMode | null>(null);
  /** Print the selected orders, or all of them when none are selected. */
  const printOrders = selectedOrders.length > 0 ? selectedOrders : orders;
  const productLines = useMemo(() => byProduct(printOrders), [printOrders]);

  // Render the chosen layout, then open the print dialog; reset once printing finishes.
  useEffect(() => {
    if (!printMode) return;
    const done = () => setPrintMode(null);
    window.addEventListener("afterprint", done);
    const t = window.setTimeout(() => window.print(), 0);
    return () => { window.clearTimeout(t); window.removeEventListener("afterprint", done); };
  }, [printMode]);

  const totalItems = (list: ReadyOrder[]) => list.reduce((n, o) => n + o.order_items.reduce((m, i) => m + i.quantity, 0), 0);

  return (
    <>
      <PageHeader
        title="Ready to send"
        description="Orders the delivery partner has confirmed with the customer. Pack every item, mark it ready to ship, then dispatch it to the hub."
        actions={orders.length > 0 && <PrintMenu onPick={setPrintMode} />}
      />

      {q.isLoading ? <Spinner /> : q.isError ? <div className="panel"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div> : orders.length === 0 ? (
        <div className="panel">
          <EmptyState icon={<PackageCheck className="h-6 w-6" />} title="Nothing to send right now"
            action={<Link to="/orders?tab=brand-confirmed" className="link text-[13.5px]">See orders being confirmed</Link>}>
            Orders appear here once the customer confirms them.
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="sticky top-14 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 lg:top-2 print:hidden">
            <label className="mr-auto flex items-center gap-2 text-[13.5px]">
              <Checkbox checked={allSelected} indeterminate={!allSelected && selected.size > 0}
                onChange={() => setSelected(allSelected ? new Set() : new Set(orders.map((o) => o.id)))} />
              {selected.size > 0
                ? <span className="font-medium">{plural(selected.size, "order")}, {plural(totalItems(selectedOrders), "item")} selected</span>
                : <span className="text-muted">{plural(orders.length, "order")}, {plural(totalItems(orders), "item")} to pack</span>}
            </label>
            <Button size="sm" disabled={confirmedSel.length === 0} loading={markPreparing.isPending}
              onClick={() => markPreparing.mutate(confirmedSel.map((o) => o.id))}>
              <PackageCheck className="h-4 w-4" /> Mark ready to ship{confirmedSel.length ? ` (${confirmedSel.length})` : ""}
            </Button>
            <Button size="sm" variant="primary" disabled={readySel.length === 0} onClick={() => setDispatchOpen(true)}>
              <Truck className="h-4 w-4" /> Dispatch to hub{readySel.length ? ` (${readySel.length})` : ""}
            </Button>
          </div>

          {printMode === "product" && (
            <section className="hidden print:block">
              <p className="mb-2 text-[13px] text-muted">
                Packing list by product: {plural(printOrders.length, "order")}, {plural(totalItems(printOrders), "item")}
              </p>
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b-2 border-ink text-left">
                    <th className="w-8 py-1.5" aria-label="Picked" />
                    <th className="w-14 py-1.5 pr-3 text-right">Qty</th>
                    <th className="py-1.5 pr-3">Product</th>
                    <th className="py-1.5 pr-3">SKU</th>
                    <th className="py-1.5">Orders</th>
                  </tr>
                </thead>
                <tbody>
                  {productLines.map((l) => (
                    <tr key={l.key} className="break-inside-avoid border-b border-line align-top">
                      <td className="py-1.5"><span className="inline-block h-3.5 w-3.5 border border-ink" /></td>
                      <td className="py-1.5 pr-3 text-right text-[15px] font-semibold">{l.quantity}×</td>
                      <td className="py-1.5 pr-3">{l.product_name}{l.variant && <span className="text-muted">, {l.variant}</span>}</td>
                      <td className="py-1.5 pr-3 text-muted">{l.sku ?? "—"}</td>
                      <td className="py-1.5 text-muted">{l.orders.map((x) => x.quantity > 1 ? `${x.order_number} (${x.quantity})` : x.order_number).join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <ul className={`space-y-3 ${printMode === "product" ? "print:hidden" : ""}`}>
            {orders.map((o) => (
              <li key={o.id} className={`panel break-inside-avoid ${selected.has(o.id) ? "border-primary/50 ring-1 ring-primary/30" : selected.size > 0 ? "print:hidden" : ""}`}>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-2.5">
                  <Checkbox aria-label={`Select ${o.order_number}`} checked={selected.has(o.id)} onChange={() => toggle(o.id)} className="print:hidden" />
                  <Link to={`/orders/${o.id}`} className="font-semibold hover:underline">{o.order_number}</Link>
                  <StatusBadge status={o.status} />
                  <span className="text-[13px] text-muted">{o.customer_name}, {o.city}</span>
                  <span className="ml-auto text-[12.5px] text-faint">Confirmed {fmtShort(o.confirmed_at)}, waiting {since(o.status_changed_at)}</span>
                </div>
                <table className="w-full text-[13.5px]">
                  <tbody>
                    {o.order_items.map((i) => (
                      <tr key={i.id} className="border-b border-line last:border-0">
                        <td className="w-16 px-4 py-2 text-right text-[15px] font-semibold">{i.quantity}×</td>
                        <td className="py-2">{i.product_name}{i.variant && <span className="text-muted">, {i.variant}</span>}</td>
                        <td className="px-4 py-2 text-right text-muted">{i.sku ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </li>
            ))}
          </ul>
        </>
      )}

      <DispatchDialog brandId={brand.id} orders={readySel} open={dispatchOpen} onClose={() => setDispatchOpen(false)} onDone={() => setSelected(new Set())} />
    </>
  );
}
