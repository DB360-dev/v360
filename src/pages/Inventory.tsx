import { describeError } from "@/lib/errors";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Archive, PackageX, Plus, Trash2 } from "lucide-react";
import { useActiveBrand } from "@/context/BrandContext";
import { useInventory, useInventoryOrders, useRemoveInventory, useUpsertInventory } from "@/hooks/useData";
import { fmtDateTime, fmtMoney, fmtShort, plural } from "@/lib/format";
import type { InventoryItem } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
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

function LocalStockOrders() {
  const { brand } = useActiveBrand();
  const q = useInventoryOrders(brand.id);
  const rows = q.data ?? [];
  const localLines = rows.reduce((n, o) => n + o.order_items.reduce((m, i) => m + i.quantity, 0), 0);

  return (
    <div className="mt-8">
      <div className="mb-3">
        <h2 className="text-[15px] font-semibold">Orders fulfilled from local stock</h2>
        <p className="text-[13px] text-muted">
          Every order with one or more items being fulfilled from your local inventory. These items don't travel to the hub.
        </p>
      </div>

      {q.isLoading ? (
        <div className="panel overflow-hidden"><table className="w-full text-[13.5px]"><thead className="table-head">
          <tr><th>Item</th><th>Order</th><th>Customer</th><th className="text-right">Qty</th><th className="text-right">Line total</th><th>Status</th></tr>
        </thead><SkeletonRows cols={6} rows={6} /></table></div>
      ) : q.isError ? (
        <div className="panel"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div>
      ) : rows.length === 0 ? (
        <div className="panel">
          <EmptyState icon={<PackageX className="h-6 w-6" />} title="No orders use local stock yet">
            When you dispatch an order and set items to "Fulfilled by Inventory", the order appears here.
          </EmptyState>
        </div>
      ) : (
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13.5px]">
              <thead className="table-head">
                <tr><th>Item</th><th>Order</th><th>Customer</th><th className="text-right">Qty</th><th className="text-right">Line total</th><th>Status</th></tr>
              </thead>
              <tbody className="table-body">
                {rows.map((o) => (
                  o.order_items.map((i) => (
                    <tr key={i.id}>
                      <td>
                        <span className="flex items-center gap-1.5">
                          <span className="h-2 w-2 shrink-0 rounded-full bg-orange-500" aria-hidden />
                          <span className="font-medium">{i.product_name}</span>
                        </span>
                        {i.variant && <span className="text-faint"> · {i.variant}</span>}
                        {i.sku && <div className="text-[12px] text-faint">{i.sku}</div>}
                      </td>
                      <td>
                        <Link to={`/orders/${o.id}`} className="font-semibold hover:underline">{o.order_number}</Link>
                        <div className="text-[12px] text-faint">{fmtShort(o.order_date)}</div>
                      </td>
                      <td>
                        <span>{o.customer_name ?? "—"}</span>
                        {o.city && <div className="text-[12px] text-faint">{o.city}</div>}
                      </td>
                      <td className="text-right">{i.quantity}</td>
                      <td className="whitespace-nowrap text-right">{fmtMoney(i.quantity * i.unit_price - i.discount, o.currency)}</td>
                      <td><StatusBadge status={o.status} /></td>
                    </tr>
                  ))
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line px-4 py-2.5 text-[12.5px] text-faint">
            {plural(rows.length, "order")} with {plural(localLines, "item")} drawn from local stock.
          </p>
        </div>
      )}
    </div>
  );
}

export function Inventory() {
  const { brand } = useActiveBrand();
  const q = useInventory(brand.id);
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [deleting, setDeleting] = useState<InventoryItem | null>(null);

  const rows = q.data ?? [];
  const availableCount = useMemo(() => rows.reduce((n, i) => n + i.quantity_available, 0), [rows]);

  return (
    <>
      <PageHeader
        title="Local stock"
        description="SKUs that are already in the country. Items matching these can be fulfilled from your local inventory instead of the hub."
        actions={availableCount > 0 && <Button onClick={() => setEditing({ quantity: 0 })}><Plus className="h-4 w-4" /> Add SKU</Button>}
      />

      {q.isLoading ? (
        <div className="panel overflow-hidden"><table className="w-full text-[13.5px]"><thead className="table-head">
          <tr><th>SKU</th><th className="text-right">Available</th><th>Updated</th><th className="w-12" /></tr>
        </thead><SkeletonRows cols={4} rows={5} /></table></div>
      ) : q.isError ? (
        <div className="panel"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div>
      ) : rows.length === 0 ? (
        <div className="panel">
          <EmptyState icon={<Archive className="h-6 w-6" />} title="No local stock yet"
            action={<Button onClick={() => setEditing({ quantity: 0 })}><Plus className="h-4 w-4" /> Add SKU</Button>}>
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
                        <Button size="sm" variant="ghost" onClick={() => setEditing({ sku: i.sku, quantity: i.quantity_available })}>Edit</Button>
                        <button className="rounded p-1.5 text-muted hover:bg-sunken hover:text-danger" title={`Remove ${i.sku}`} onClick={() => setDeleting(i)}>
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

      <InventoryDialog brandId={brand.id} target={editing} onClose={() => setEditing(null)} />
      <DeleteDialog brandId={brand.id} item={deleting} onClose={() => setDeleting(null)} />
      <LocalStockOrders />
    </>
  );
}