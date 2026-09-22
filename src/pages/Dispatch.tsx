import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PackageCheck, Printer, Truck } from "lucide-react";
import { useActiveBrand } from "@/context/BrandContext";
import { useMarkPreparing, useReadyToSend, type ReadyOrder } from "@/hooks/useData";
import { fmtShort, plural, since } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { EmptyState, ErrorState, Spinner } from "@/components/ui/States";
import { DispatchDialog } from "@/components/DispatchDialog";

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
  const totalItems = (list: ReadyOrder[]) => list.reduce((n, o) => n + o.order_items.reduce((m, i) => m + i.quantity, 0), 0);

  return (
    <>
      <PageHeader
        title="Ready to send"
        description="Customer-confirmed orders. Pack every item, then dispatch them to the hub."
        actions={orders.length > 0 && <Button onClick={() => window.print()} className="print:hidden"><Printer className="h-4 w-4" /> Print packing list</Button>}
      />

      {q.isLoading ? <Spinner /> : q.isError ? <div className="panel"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div> : orders.length === 0 ? (
        <div className="panel">
          <EmptyState icon={<PackageCheck className="h-6 w-6" />} title="Nothing to send right now"
            action={<Link to="/orders?tab=confirming" className="link text-[13.5px]">See orders being confirmed</Link>}>
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
              <PackageCheck className="h-4 w-4" /> Mark preparing{confirmedSel.length ? ` (${confirmedSel.length})` : ""}
            </Button>
            <Button size="sm" variant="primary" disabled={selected.size === 0} onClick={() => setDispatchOpen(true)}>
              <Truck className="h-4 w-4" /> Dispatch to hub
            </Button>
          </div>

          <ul className="space-y-3">
            {orders.map((o) => (
              <li key={o.id} className={`panel break-inside-avoid ${selected.has(o.id) ? "border-primary/50 ring-1 ring-primary/30" : ""}`}>
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

      <DispatchDialog brandId={brand.id} orders={selectedOrders} open={dispatchOpen} onClose={() => setDispatchOpen(false)} onDone={() => setSelected(new Set())} />
    </>
  );
}
