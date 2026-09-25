import { describeError } from "@/lib/errors";
import { useEffect, useMemo, useState } from "react";
import { Dialog } from "./ui/Dialog";
import { Button } from "./ui/Button";
import { TextArea, TextField } from "./ui/Field";
import { Spinner } from "./ui/States";
import { useDispatch, useDispatchItems, useInventory, useRestockedOrders } from "@/hooks/useData";
import { plural, todayISO } from "@/lib/format";
import type { OrderItem } from "@/lib/types";

const COURIERS = ["TCS", "Leopards", "M&P", "Trax", "PostEx", "Hand delivery"];

interface Props {
  brandId: string;
  orders: { id: string; order_number: string }[];
  open: boolean;
  onClose: () => void;
  onDone?: () => void;
}

export function DispatchDialog({ brandId, orders, open, onClose, onDone }: Props) {
  const dispatch = useDispatch(brandId, { inlineErrors: true });
  const items = useDispatchItems(brandId, open ? orders.map((o) => o.id) : []);
  const inventory = useInventory(brandId);
  const restocked = useRestockedOrders(brandId);
  const [courier, setCourier] = useState("TCS");
  const [tracking, setTracking] = useState("");
  const date = todayISO();
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  // item id -> units from BD inventory (0 = all from Pakistan, absent = 0)
  const [sources, setSources] = useState<Record<string, number>>({});

  useEffect(() => {
    if (open) { dispatch.reset(); setCourier("TCS"); setTracking(""); setNotes(""); setErrors({}); setSources({}); }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // key = SKU when present, otherwise "product_name|variant"
  const itemKey = (i: { sku: string | null; product_name: string; variant: string | null }) =>
    i.sku ?? `${i.product_name}|${i.variant ?? ""}`;

  // Total available quantity per key, combining brand_inventory + SKU-less restocked returns.
  // SKU items are already reflected in brand_inventory (trigger keeps it in sync), so we
  // only add restocked items for SKU-less lines to avoid double-counting.
  const availableQtyMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const inv of inventory.data ?? []) {
      if (inv.quantity_available > 0) map.set(inv.sku, (map.get(inv.sku) ?? 0) + inv.quantity_available);
    }
    for (const r of restocked.data ?? []) {
      if (r.sku) continue; // SKU items are already in brand_inventory
      const avail = r.available_qty ?? r.quantity;
      if (avail > 0) {
        const k = itemKey(r);
        map.set(k, (map.get(k) ?? 0) + avail);
      }
    }
    return map;
  }, [inventory.data, restocked.data]);

  const byOrder = useMemo(() => (items.data ?? []).filter((o) => orders.some((s) => s.id === o.id)), [items.data, orders]);
  const allItems = useMemo(() => byOrder.flatMap((o) => o.order_items), [byOrder]);
  const inventoryCount = Object.values(sources).filter((n) => n > 0).length;

  const submit = () => {
    const e: Record<string, string> = {};
    if (!courier.trim()) e.courier = "Enter the courier you used";
    if (courier.trim() !== "Hand delivery" && !tracking.trim()) e.tracking = "Enter the consignment number so the parcel can be tracked";
    if (!date) e.date = "Enter the dispatch date";
    setErrors(e);
    if (Object.keys(e).length) return;
    // Compute clamped sources at submit time to prevent stale over-allocations
    const clampedSources: Record<string, number> = {};
    for (const item of allItems) {
      const key = itemKey(item);
      const totalAvail = availableQtyMap.get(key) ?? 0;
      const allocatedElsewhere = allItems
        .filter((x) => x.id !== item.id && (clampedSources[x.id] ?? 0) > 0 && itemKey(x) === key)
        .reduce((n, x) => n + (clampedSources[x.id] ?? 0), 0);
      const max = Math.min(item.quantity, Math.max(0, totalAvail - allocatedElsewhere));
      clampedSources[item.id] = Math.min(sources[item.id] ?? 0, max);
    }
    dispatch.mutate(
      {
        orderIds: orders.map((o) => o.id), courier, tracking, date, notes,
        itemSources: Object.fromEntries(Object.entries(clampedSources).filter(([, n]) => n > 0)),
      },
      { onSuccess: () => { onDone?.(); onClose(); } },
    );
  };

  const list = orders.map((o) => o.order_number).join(", ");

  const itemRow = (i: OrderItem) => {
    const key = itemKey(i);
    const totalAvail = availableQtyMap.get(key) ?? 0;
    const available = totalAvail > 0;
    const inventoryQty = sources[i.id] ?? 0;
    // Units already allocated by other items with the same key
    const allocatedElsewhere = allItems
      .filter((x) => x.id !== i.id && (sources[x.id] ?? 0) > 0 && itemKey(x) === key)
      .reduce((n, x) => n + (sources[x.id] ?? 0), 0);
    // How many units this item can take from inventory (can't exceed what's left after others)
    const maxForThis = Math.min(i.quantity, Math.max(0, totalAvail - allocatedElsewhere));
    // Clamp current selection to what's actually available
    const effectiveQty = Math.min(inventoryQty, maxForThis);

    return (
      <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
        <span className="w-9 shrink-0 text-right text-[15px] font-semibold">{i.quantity}×</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            {available && <span className="h-2 w-2 shrink-0 rounded-full bg-orange-500" title="Available in your local inventory" aria-label="Available in local inventory" />}
            <span className="truncate">{i.product_name}{i.variant && <span className="text-muted">, {i.variant}</span>}</span>
          </span>
          <span className="text-[12.5px] text-muted">{i.sku ?? "No SKU"}</span>
        </span>
        <select
          value={effectiveQty}
          onChange={(e) => setSources((s) => ({ ...s, [i.id]: Number(e.target.value) }))}
          className="input h-8 w-[196px] px-2 py-0 pr-7 text-[13px]"
          aria-label={`Where ${i.product_name} is fulfilled from`}
        >
          <option value={0}>Fulfilled by Pakistan</option>
          {available && Array.from({ length: maxForThis }, (_, idx) => idx + 1).map((n) => (
            <option key={n} value={n}>
              {n === i.quantity
                ? "Fulfilled by Inventory"
                : `${n} from BD inventory, ${i.quantity - n} from PK`}
            </option>
          ))}
        </select>
      </li>
    );
  };

  return (
    <Dialog
      open={open} onClose={onClose} onSubmit={submit} busy={dispatch.isPending} error={dispatch.error ? describeError(dispatch.error) : null}
      title={`Dispatch ${plural(orders.length, "order")} to the hub`}
      description={<span className="line-clamp-2" title={list}>{list}</span>}
      width="lg"
      footer={<>
        <Button onClick={onClose} disabled={dispatch.isPending}>Cancel</Button>
        <Button type="submit" variant="primary" loading={dispatch.isPending}>Dispatch to hub</Button>
      </>}
    >
      <div className="space-y-4">
        <div>
          <TextField label="Courier" value={courier} onChange={(e) => setCourier(e.target.value)} list="courier-options" error={errors.courier} autoComplete="off" />
          <datalist id="courier-options">{COURIERS.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
        <TextField
          label="Consignment / tracking number" value={tracking} onChange={(e) => setTracking(e.target.value)}
          error={errors.tracking} placeholder="e.g. 779912345678" optional={courier.trim() === "Hand delivery"}
          hint="If these orders are in one parcel, use the same number for all of them."
        />
        <TextField label="Dispatch date" value={date} readOnly />
        <TextArea label="Notes for the hub" optional value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="e.g. 2 bags, fragile items in the blue bag" />

        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <h3 className="text-[13px] font-semibold">Items in this dispatch</h3>
            <span className="h-px flex-1 bg-line" />
            {inventoryCount > 0 && (
              <span className="text-[12.5px] font-medium text-muted">
                {plural(inventoryCount, "item")} from local inventory
              </span>
            )}
          </div>
          {items.isLoading ? (
            <div className="flex justify-center py-6"><Spinner /></div>
          ) : items.isError ? (
            <p role="alert" className="rounded border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">
              Couldn't load the items. <button onClick={() => items.refetch()} className="link text-danger">Retry</button>
            </p>
          ) : byOrder.length === 0 ? (
            <p className="rounded bg-sunken px-3 py-2 text-[13px] text-muted">No items found for these orders.</p>
          ) : (
            <div className="overflow-hidden rounded border border-line">
              {byOrder.map((o) => (
                <div key={o.id} className={byOrder.length > 1 ? "border-b border-line last:border-0" : ""}>
                  <p className="bg-sunken/60 px-4 py-1.5 text-[12.5px] font-medium text-muted">
                    {o.order_number} — {plural(o.order_items.length, "item")}
                  </p>
                  <ul className="divide-y divide-line">
                    {o.order_items.map(itemRow)}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="rounded bg-sunken px-3 py-2 text-[13px] text-muted">
          Items set to "Fulfilled by Inventory" are already in the country — leave them out of the parcel.
          Every other item must be packed; the hub checks each order on arrival.
        </p>
      </div>
    </Dialog>
  );
}