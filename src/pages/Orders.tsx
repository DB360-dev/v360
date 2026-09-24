import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Inbox, Search, Upload, X } from "lucide-react";
import { useActiveBrand } from "@/context/BrandContext";
import { PAGE_SIZE, useMarkPreparing, useOrders, useStatusCounts } from "@/hooks/useData";
import { BRAND_DISPATCHABLE, ORDER_TABS, brandStatus, fulfilmentStatus, masterStatus } from "@/lib/status";
import { fmtMoney, fmtShort, plural, since } from "@/lib/format";
import type { OrderOverview } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/States";
import { DispatchDialog } from "@/components/DispatchDialog";
import { ImportOrdersModal } from "@/components/ImportOrdersModal";

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

function trackingOf(o: OrderOverview): string | null {
  if (o.delivery_tracking_number) return `${o.delivery_courier ?? "Courier"} ${o.delivery_tracking_number}`;
  if (o.shipment_code) return o.shipment_code;
  if (o.inbound_tracking) return `${o.inbound_courier ?? ""} ${o.inbound_tracking}`.trim();
  return null;
}

export function Orders() {
  const { brand } = useActiveBrand();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tabKey = params.get("tab") ?? "action";
  const tab = ORDER_TABS.find((t) => t.key === tabKey) ?? ORDER_TABS[0];
  const page = Math.max(0, Number(params.get("page") ?? 0) || 0);
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const [searchInput, setSearchInput] = useState(params.get("q") ?? "");
  const search = useDebounced(searchInput);

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    if (!("page" in patch)) next.delete("page");
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if (search !== (params.get("q") ?? "")) update({ q: search || null });
  }, [search]); // eslint-disable-line

  const counts = useStatusCounts(brand.id).data;
  const q = useOrders(brand.id, { statuses: tab.statuses, search, from, to, page });
  const rows = q.data?.rows ?? [];
  const total = q.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Selection (only orders the brand can act on in bulk)
  const [selected, setSelected] = useState<Map<string, OrderOverview>>(new Map());
  useEffect(() => setSelected(new Map()), [tabKey, search, from, to, page, brand.id]);
  const selectable = useMemo(() => rows.filter((r) => BRAND_DISPATCHABLE.includes(r.status)), [rows]);
  const allSelected = selectable.length > 0 && selectable.every((r) => selected.has(r.id));
  const toggle = (r: OrderOverview) => setSelected((m) => { const n = new Map(m); if (n.has(r.id)) n.delete(r.id); else n.set(r.id, r); return n; });
  const toggleAll = () => setSelected(allSelected ? new Map() : new Map(selectable.map((r) => [r.id, r])));

  const markPreparing = useMarkPreparing(brand.id);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const selectedList = [...selected.values()];
  const confirmedSelected = selectedList.filter((r) => r.status === "confirmed");

  const tabCount = (statuses: typeof tab.statuses) =>
    counts ? (statuses ? statuses.reduce((n, s) => n + (counts[s] ?? 0), 0) : Object.values(counts).reduce((a, b) => a + (b ?? 0), 0)) : null;

  const filtersActive = !!(search || from || to);

  return (
    <>
      <PageHeader
        title="Orders"
        description="Orders imported automatically from Shopify or added manually via CSV."
        actions={
          <Button variant="secondary" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" /> Import CSV
          </Button>
        }
      />

      <div role="tablist" aria-label="Order stages" className="-mx-1 mb-4 flex gap-1 overflow-x-auto border-b border-line px-1">
        {ORDER_TABS.map((t) => {
          const n = tabCount(t.statuses);
          const active = t.key === tab.key;
          return (
            <button
              key={t.key} role="tab" aria-selected={active} onClick={() => update({ tab: t.key })}
              className={`-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-[13.5px] ${
                active ? "border-primary font-medium text-ink" : "border-transparent text-muted hover:text-ink"}`}
            >
              {t.label}
              {n !== null && n > 0 && (
                <span className={`rounded-full px-1.5 text-[12px] ${t.key === "action" ? "bg-g-brand-bg font-semibold text-g-brand" : "bg-sunken text-muted"}`}>{n}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <span className="sr-only">Search orders</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden />
          <input className="input pl-9" placeholder="Order number, customer, phone or city" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </label>
        <label className="text-[12.5px] text-muted">From
          <input type="date" className="input mt-1 w-[150px]" value={from} max={to || undefined} onChange={(e) => update({ from: e.target.value || null })} />
        </label>
        <label className="text-[12.5px] text-muted">To
          <input type="date" className="input mt-1 w-[150px]" value={to} min={from || undefined} onChange={(e) => update({ to: e.target.value || null })} />
        </label>
        {filtersActive && (
          <Button variant="ghost" size="sm" onClick={() => { setSearchInput(""); update({ q: null, from: null, to: null }); }}>
            <X className="h-3.5 w-3.5" /> Clear filters
          </Button>
        )}
      </div>

      {selected.size > 0 && (
        <div className="sticky top-14 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary-soft px-4 py-2.5 lg:top-2">
          <span className="mr-auto text-[13.5px] font-medium text-primary">{plural(selected.size, "order")} selected</span>
          {confirmedSelected.length > 0 && (
            <Button size="sm" loading={markPreparing.isPending}
              onClick={() => markPreparing.mutate(confirmedSelected.map((r) => r.id), { onSuccess: () => setSelected(new Map()) })}>
              Mark {confirmedSelected.length} as preparing
            </Button>
          )}
          <Button size="sm" variant="primary" onClick={() => setDispatchOpen(true)}>Dispatch to hub</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Map())}>Clear</Button>
        </div>
      )}

      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-[13.5px]">
            <thead className="table-head">
              <tr>
                <th className="w-10">
                  <Checkbox aria-label="Select all orders that can be dispatched" checked={allSelected}
                    indeterminate={!allSelected && selected.size > 0} disabled={selectable.length === 0} onChange={toggleAll} />
                </th>
                <th>Order</th><th>Date</th><th>Customer</th><th className="text-right">Items</th>
                <th className="text-right">COD</th><th>Fulfilment status</th><th>Brand status</th><th>Master status</th><th>Tracking</th>
              </tr>
            </thead>
            {q.isLoading ? <SkeletonRows cols={10} /> : (
              <tbody className={`table-body ${q.isFetching && !q.isLoading ? "opacity-70" : ""}`}>
                {rows.map((o) => {
                  const canSelect = BRAND_DISPATCHABLE.includes(o.status);
                  const fulfilment = fulfilmentStatus(o.status);
                  const brand = brandStatus(o.status);
                  const master = masterStatus(o.status);
                  return (
                    <tr key={o.id} onClick={() => navigate(`/orders/${o.id}`)} className="cursor-pointer hover:bg-sunken/50">
                      <td onClick={(e) => e.stopPropagation()}>
                        <Checkbox aria-label={`Select ${o.order_number}`} checked={selected.has(o.id)} disabled={!canSelect}
                          title={canSelect ? undefined : "Only confirmed orders can be dispatched"} onChange={() => toggle(o)} />
                      </td>
                      <td><Link to={`/orders/${o.id}`} onClick={(e) => e.stopPropagation()} className="font-semibold hover:underline">{o.order_number}</Link></td>
                      <td className="whitespace-nowrap text-muted">{fmtShort(o.order_date)}</td>
                      <td>
                        <div className="max-w-[220px] truncate">{o.customer_name ?? "—"}</div>
                        <div className="text-[12.5px] text-faint">{o.city ?? ""}</div>
                      </td>
                      <td className="text-right">{o.item_count}</td>
                      <td className="whitespace-nowrap text-right">{fmtMoney(o.cod_amount_expected ?? o.order_total, o.cod_currency ?? o.currency)}</td>
                      <td><Pill group={fulfilment.group} label={fulfilment.label} /></td>
                      <td><Pill group={brand.group} label={brand.label} /></td>
                      <td>
                        <div className="flex items-center gap-2">
                          <Pill group={master.group} label={master.label} />
                          <span className="text-[12px] text-faint" title="Time in this status">{since(o.status_changed_at)}</span>
                        </div>
                      </td>
                      <td className="max-w-[180px] truncate text-muted">{trackingOf(o) ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            )}
          </table>
        </div>

        {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} title="Orders didn't load" />}
        {!q.isLoading && !q.isError && rows.length === 0 && (
          <EmptyState icon={<Inbox className="h-6 w-6" />} title={filtersActive ? "No orders match your filters" : tab.key === "action" ? "Nothing needs your action" : "No orders here"}>
            {filtersActive ? "Try a different search or date range." : tab.key === "action" ? "New confirmed or imported orders will appear here for you to prepare and dispatch." : "Orders move through these tabs as they progress."}
          </EmptyState>
        )}

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-[13px] text-muted">
            <span>{page * PAGE_SIZE + 1}–{Math.min(total, (page + 1) * PAGE_SIZE)} of {total}</span>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => update({ page: String(page - 1) })} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
              <Button size="sm" variant="ghost" disabled={page >= pages - 1} onClick={() => update({ page: String(page + 1) })} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        )}
      </div>

      <DispatchDialog brandId={brand.id} orders={selectedList} open={dispatchOpen} onClose={() => setDispatchOpen(false)} onDone={() => setSelected(new Map())} />
      <ImportOrdersModal brandId={brand.id} open={importOpen} onClose={() => setImportOpen(false)} />
    </>
  );
}

