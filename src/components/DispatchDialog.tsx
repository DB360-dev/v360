import { describeError } from "@/lib/errors";
import { useEffect, useMemo, useState } from "react";
import { Dialog } from "./ui/Dialog";
import { Button } from "./ui/Button";
import { TextArea, TextField } from "./ui/Field";
import { Spinner } from "./ui/States";
import { useDispatch, useDispatchItems, useInventory } from "@/hooks/useData";
import { plural, todayISO } from "@/lib/format";
import type { FulfillmentSource, OrderItem } from "@/lib/types";

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
  const [courier, setCourier] = useState("TCS");
  const [tracking, setTracking] = useState("");
  const date = todayISO();
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  // item id -> source. Anything absent is "pakistan".
  const [sources, setSources] = useState<Record<string, FulfillmentSource>>({});

  useEffect(() => {
    if (open) { dispatch.reset(); setCourier("TCS"); setTracking(""); setNotes(""); setErrors({}); setSources({}); }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const availableSkus = useMemo(
    () => new Set((inventory.data ?? []).filter((i) => i.quantity_available > 0).map((i) => i.sku)),
    [inventory.data],
  );
  const byOrder = useMemo(() => (items.data ?? []).filter((o) => orders.some((s) => s.id === o.id)), [items.data, orders]);
  const inventoryCount = Object.values(sources).filter((s) => s === "bangladesh").length;

  const submit = () => {
    const e: Record<string, string> = {};
    if (!courier.trim()) e.courier = "Enter the courier you used";
    if (courier.trim() !== "Hand delivery" && !tracking.trim()) e.tracking = "Enter the consignment number so the parcel can be tracked";
    if (!date) e.date = "Enter the dispatch date";
    setErrors(e);
    if (Object.keys(e).length) return;
    dispatch.mutate(
      {
        orderIds: orders.map((o) => o.id), courier, tracking, date, notes,
        itemSources: Object.fromEntries(Object.entries(sources).filter(([, s]) => s === "bangladesh")),
      },
      { onSuccess: () => { onDone?.(); onClose(); } },
    );
  };

  const list = orders.map((o) => o.order_number).join(", ");

  const itemRow = (i: OrderItem) => {
    const available = !!i.sku && availableSkus.has(i.sku);
    const source = sources[i.id] ?? "pakistan";
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
          value={source}
          onChange={(e) => setSources((s) => ({ ...s, [i.id]: e.target.value as FulfillmentSource }))}
          className="input h-8 w-[176px] px-2 py-0 pr-7 text-[13px]"
          aria-label={`Where ${i.product_name} is fulfilled from`}
        >
          <option value="pakistan">Fulfilled by Pakistan</option>
          <option value="bangladesh" disabled={!available}>Fulfilled by Inventory</option>
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