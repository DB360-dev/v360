import { describeError } from "@/lib/errors";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Archive, PackageX, Plus, Trash2 } from "lucide-react";
import { useActiveBrand } from "@/context/BrandContext";
import {
  useInventory, useInventoryOrders, useRemoveInventory,
  useRestockedOrders, useUpsertInventory,
} from "@/hooks/useData";
import { fmtDateTime, fmtShort, plural } from "@/lib/format";
import type { InventoryItem } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TextField } from "@/components/ui/Field";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/States";

interface EditTarget { sku?: string; quantity: number }

function InventoryDialog({ brandId, target, onClose }: { brandId: string; target: EditTarget | null; onClose: () => void }) {
  const save = useUpsertInventory(brandId, { inlineErrors: true });
  const [sku, setSku] = useState("");
  const [qty, setQty] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (target) { save.reset(); setSku(target.sku ?? ""); setQty(String(target.quantity)); setError(null); }
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = () => {
    if (!sku.trim()) { setError("Enter the SKU"); return; }
    const n = Number(qty);
    if (!Number.isInteger(n) || n < 0) { setError("Enter how many are available (0 or more)"); return; }
    save.mutate({ sku: sku.trim(), quantity: n }, { onSuccess: onClose });
  };

  return (
    <Dialog
      open={!!target} onClose={onClose} onSubmit={submit} busy={save.isPending}
      error={save.error ? describeError(save.error) : null} width="sm"
      title={target?.sku ? `Update local stock: ${target.sku}` : "Add to local inventory"}
      description="Stock that's already in the country. Line items can be fulfilled from here instead of being shipped with the next dispatch."
      footer={<>
        <Button onClick={onClose} disabled={save.isPending}>Cancel</Button>
        <Button type="submit" variant="primary" loading={save.isPending}>{target?.sku ? "Save" : "Add SKU"}</Button>
      </>}
    >
      <div className="space-y-4">
        <TextField label="SKU" value={sku} onChange={(e) => setSku(e.target.value)} disabled={!!target?.sku} error={error}
          placeholder="e.g. BLUE-TEE-M" autoComplete="off" autoFocus />
        <TextField label="Available quantity" value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" placeholder="0"
          hint="Each line item fulfilled from here when you dispatch deducts this amount." />
      </div>
    </Dialog>
  );
}

function DeleteDialog({ brandId, item, onClose }: { brandId: string; item: InventoryItem | null; onClose: () => void }) {
  const remove = useRemoveInventory(brandId, { inlineErrors: true });
  const submit = () => remove.mutate(item!.sku, { onSuccess: onClose });

  return (
    <Dialog
      open={!!item} onClose={onClose} onSubmit={submit} busy={remove.isPending}
      error={remove.error ? describeError(remove.error) : null} width="sm"
      title={`Remove ${item?.sku ?? "SKU"}?`}
      description="It won't show the orange dot in the dispatch dialog anymore. Already-dispatched orders are unaffected."
      footer={<>
        <Button onClick={onClose} disabled={remove.isPending}>Keep</Button>
        <Button type="submit" variant="danger" loading={remove.isPending}>Remove</Button>
      </>}
    >
      <p className="text-[13.5px] text-muted">You can re-add it any time.</p>
    </Dialog>
  );
}

function StockTab({ brandId, onAdd, onEdit, onDelete }: {
  brandId: string;
  onAdd: () => void;
  onEdit: (item: InventoryItem) => void;
  onDelete: (item: InventoryItem) => void;
}) {
  const q = useInventory(brandId);
  const restocked = useRestockedOrders(brandId);

  const rows = q.data ?? [];
  const availableCount = useMemo(() => rows.reduce((n, i) => n + i.quantity_available, 0), [rows]);

  const restockedRows = restocked.data ?? [];
  const totalRestockedQty = restockedRows.reduce((n, r) => n + r.quantity, 0);

  return (
    <>
      {q.isLoading ? (
        <div className="panel overflow-hidden"><table className="w-full text-[13.5px]"><thead className="table-head">
          <tr><th>SKU</th><th className="text-right">Available</th><th>Updated</th><th className="w-12" /></tr>
        </thead><SkeletonRows cols={4} rows={5} /></table></div>
      ) : q.isError ? (
        <div className="panel"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div>
      ) : rows.length === 0 ? (
        <div className="panel">
          <EmptyState icon={<Archive className="h-6 w-6" />} title="No local stock yet"
            action={<Button onClick={onAdd}><Plus className="h-4 w-4" /> Add SKU</Button>}>
            When you have items already in the country, add their SKUs here. In the dispatch dialog they'll show an
            orange dot and can be fulfilled from local inventory.
          </EmptyState>
        </div>
      ) : (
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[13.5px]">
              <thead className="table-head">
                <tr><th>SKU</th><th className="text-right">Available</th><th>Updated</th><th className="w-12" /></tr>
              </thead>
              <tbody className="table-body">
                {rows.map((i) => (
                  <tr key={i.sku} className="hover:bg-sunken/40">
                    <td className="font-medium">
                      {i.quantity_available > 0 && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-orange-500" aria-hidden />}
                      {i.sku}
                    </td>
                    <td className="text-right tabular-nums">{i.quantity_available}</td>
                    <td className="whitespace-nowrap text-muted">{fmtDateTime(i.updated_at)}</td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => onEdit(i)}>Edit</Button>
                        <button className="rounded p-1.5 text-muted hover:bg-sunken hover:text-danger" title={`Remove ${i.sku}`} onClick={() => onDelete(i)}>
                          <Trash2 className="h-4 w-4" /><span className="sr-only">Remove {i.sku}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line px-4 py-2.5 text-[12.5px] text-faint">
            {plural(availableCount, "item")} available across {plural(rows.length, "SKU")}.
          </p>
        </div>
      )}

      {/* Restocked returns section */}
      <div className="mt-8">
        <div className="mb-3">
          <h2 className="text-[15px] font-semibold">Items restocked from returns</h2>
          <p className="text-[13px] text-muted">
            Returned items whose disposition was set to "Restock in BD". These are available to fill new orders.
          </p>
        </div>

        {restocked.isLoading ? (
          <div className="panel overflow-hidden"><table className="w-full text-[13.5px]"><thead className="table-head">
            <tr><th>Item</th><th>Order</th><th>Customer</th><th className="text-right">Qty</th><th className="text-right">Available</th><th>Restocked</th></tr>
          </thead><SkeletonRows cols={6} rows={6} /></table></div>
        ) : restocked.isError ? (
          <div className="panel"><ErrorState error={restocked.error} onRetry={() => restocked.refetch()} /></div>
        ) : restockedRows.length === 0 ? (
          <div className="panel">
            <EmptyState icon={<PackageX className="h-6 w-6" />} title="Nothing restocked yet">
              Returned items marked "Restock in BD" appear here.
            </EmptyState>
          </div>
        ) : (
          <div className="panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-[13.5px]">
                <thead className="table-head">
                  <tr><th>Item</th><th>Order</th><th>Customer</th><th className="text-right">Original</th><th className="text-right">Available</th><th>Restocked</th></tr>
                </thead>
                <tbody className="table-body">
                  {restockedRows.map((r) => (
                    <tr key={r.order_item_id}>
                      <td>
                        <span className="flex items-center gap-1.5">
                          {(r.available_qty ?? r.quantity) > 0 && <span className="h-2 w-2 shrink-0 rounded-full bg-orange-500" aria-hidden />}
                          <span className="font-medium">{r.product_name}</span>
                        </span>
                        {r.variant && <span className="text-faint"> · {r.variant}</span>}
                        {r.sku && <div className="text-[12px] text-faint">{r.sku}</div>}
                      </td>
                      <td>
                        <Link to={`/orders/${r.order_id}`} className="font-semibold hover:underline">{r.order_number}</Link>
                        <div className="text-[12px] text-faint">{fmtShort(r.order_date)}</div>
                      </td>
                      <td>
                        <span>{r.customer_name ?? "—"}</span>
                        {r.city && <div className="text-[12px] text-faint">{r.city}</div>}
                      </td>
                      <td className="text-right tabular-nums">{r.quantity}</td>
                      <td className="text-right tabular-nums">
                        <span className={(r.available_qty ?? r.quantity) > 0 ? "font-medium" : "text-faint"}>
                          {r.available_qty ?? r.quantity}
                        </span>
                      </td>
                      <td className="whitespace-nowrap text-muted" title={r.restock_note ?? undefined}>
                        {r.restocked_at ? fmtDateTime(r.restocked_at) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-line px-4 py-2.5 text-[12.5px] text-faint">
              {plural(restockedRows.length, "item")} restocked, {plural(totalRestockedQty, "unit")} total.
            </p>
          </div>
        )}
      </div>
    </>
  );
}

function OrdersTab({ brandId }: { brandId: string }) {
  const q = useInventoryOrders(brandId);
  const rows = q.data ?? [];

  // Group by order for display
  const byOrder = useMemo(() => {
    const map = new Map<string, { order_number: string; order_date: string; customer_name: string | null; city: string | null; status: string; items: typeof rows }>();
    for (const r of rows) {
      if (!map.has(r.order_id)) {
        map.set(r.order_id, {
          order_number: r.order_number,
          order_date: r.order_date,
          customer_name: r.customer_name,
          city: r.city,
          status: r.status,
          items: [],
        });
      }
      map.get(r.order_id)!.items.push(r);
    }
    return [...map.entries()];
  }, [rows]);

  if (q.isLoading) {
    return (
      <div className="panel overflow-hidden">
        <table className="w-full text-[13.5px]">
          <thead className="table-head">
            <tr><th>Order</th><th>Customer</th><th>Item</th><th className="text-right">From inventory</th><th className="text-right">Total</th></tr>
          </thead>
          <SkeletonRows cols={5} rows={6} />
        </table>
      </div>
    );
  }

  if (q.isError) {
    return <div className="panel"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div>;
  }

  if (byOrder.length === 0) {
    return (
      <div className="panel">
        <EmptyState icon={<Archive className="h-6 w-6" />} title="No orders from local inventory yet">
          When you dispatch an order using items from your local BD stock, they'll appear here.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-[13.5px]">
          <thead className="table-head">
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Item</th>
              <th className="text-right">From inventory</th>
              <th className="text-right">Total ordered</th>
            </tr>
          </thead>
          <tbody className="table-body">
            {byOrder.map(([orderId, o]) =>
              o.items.map((item, idx) => (
                <tr key={item.order_item_id}>
                  {idx === 0 && (
                    <td rowSpan={o.items.length} className="align-top">
                      <Link to={`/orders/${orderId}`} className="font-semibold hover:underline">{o.order_number}</Link>
                      <div className="text-[12px] text-faint">{fmtShort(o.order_date)}</div>
                    </td>
                  )}
                  {idx === 0 && (
                    <td rowSpan={o.items.length} className="align-top">
                      <span>{o.customer_name ?? "—"}</span>
                      {o.city && <div className="text-[12px] text-faint">{o.city}</div>}
                    </td>
                  )}
                  <td>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-orange-500" aria-hidden />
                      <span className="font-medium">{item.product_name}</span>
                    </span>
                    {item.variant && <span className="text-faint text-[12px]"> · {item.variant}</span>}
                    {item.sku && <div className="text-[12px] text-faint">{item.sku}</div>}
                  </td>
                  <td className="text-right tabular-nums font-medium text-orange-600">{item.inventory_qty}</td>
                  <td className="text-right tabular-nums text-muted">{item.quantity}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line px-4 py-2.5 text-[12.5px] text-faint">
        {plural(byOrder.length, "order")} used local inventory.
      </p>
    </div>
  );
}

export function Inventory() {
  const { brand } = useActiveBrand();
  const [tab, setTab] = useState<"stock" | "orders">("stock");
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [deleting, setDeleting] = useState<InventoryItem | null>(null);

  const q = useInventory(brand.id);
  const rows = q.data ?? [];
  const availableCount = useMemo(() => rows.reduce((n, i) => n + i.quantity_available, 0), [rows]);

  const tabClass = (t: typeof tab) =>
    `px-4 py-2 text-[13px] font-medium border-b-2 transition-colors ${
      tab === t ? "border-primary text-primary" : "border-transparent text-muted hover:text-default"
    }`;

  return (
    <>
      <PageHeader
        title="Local stock"
        description="SKUs already in the country. Items here can be fulfilled from local inventory at dispatch. Returned items restocked in BD are added automatically."
        actions={tab === "stock" && availableCount > 0 && (
          <Button onClick={() => setEditing({ quantity: 0 })}><Plus className="h-4 w-4" /> Add SKU</Button>
        )}
      />

      <div className="mb-4 flex border-b border-line">
        <button className={tabClass("stock")} onClick={() => setTab("stock")}>Stock</button>
        <button className={tabClass("orders")} onClick={() => setTab("orders")}>Orders</button>
      </div>

      {tab === "stock" && (
        <StockTab
          brandId={brand.id}
          onAdd={() => setEditing({ quantity: 0 })}
          onEdit={(i) => setEditing({ sku: i.sku, quantity: i.quantity_available })}
          onDelete={(i) => setDeleting(i)}
        />
      )}

      {tab === "orders" && <OrdersTab brandId={brand.id} />}

      <InventoryDialog brandId={brand.id} target={editing} onClose={() => setEditing(null)} />
      <DeleteDialog brandId={brand.id} item={deleting} onClose={() => setDeleting(null)} />
    </>
  );
}
