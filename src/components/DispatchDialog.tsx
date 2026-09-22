import { describeError } from "@/lib/errors";
import { useEffect, useState } from "react";
import { Dialog } from "./ui/Dialog";
import { Button } from "./ui/Button";
import { TextArea, TextField } from "./ui/Field";
import { useDispatch } from "@/hooks/useData";
import { plural, todayISO } from "@/lib/format";

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
  const [courier, setCourier] = useState("TCS");
  const [tracking, setTracking] = useState("");
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) { dispatch.reset(); setCourier("TCS"); setTracking(""); setDate(todayISO()); setNotes(""); setErrors({}); }
  }, [open]);

  const submit = () => {
    const e: Record<string, string> = {};
    if (!courier.trim()) e.courier = "Enter the courier you used";
    if (courier.trim() !== "Hand delivery" && !tracking.trim()) e.tracking = "Enter the consignment number so the parcel can be tracked";
    if (!date) e.date = "Enter the dispatch date";
    else if (date > todayISO()) e.date = "Dispatch date can't be in the future";
    setErrors(e);
    if (Object.keys(e).length) return;
    dispatch.mutate(
      { orderIds: orders.map((o) => o.id), courier, tracking, date, notes },
      { onSuccess: () => { onDone?.(); onClose(); } },
    );
  };

  const list = orders.map((o) => o.order_number).join(", ");

  return (
    <Dialog
      open={open} onClose={onClose} onSubmit={submit} busy={dispatch.isPending} error={dispatch.error ? describeError(dispatch.error) : null}
      title={`Dispatch ${plural(orders.length, "order")} to the hub`}
      description={<span className="line-clamp-2" title={list}>{list}</span>}
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
        <TextField label="Dispatch date" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} error={errors.date} />
        <TextArea label="Notes for the hub" optional value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="e.g. 2 bags, fragile items in the blue bag" />
        <p className="rounded bg-sunken px-3 py-2 text-[13px] text-muted">
          Every item in these orders must be in the parcel. Each order is checked at the hub on arrival, and it only ships onward once all its items are received.
        </p>
      </div>
    </Dialog>
  );
}
