import { describeError } from "@/lib/errors";
import { useEffect, useState } from "react";
import { Dialog } from "./ui/Dialog";
import { Button } from "./ui/Button";
import { TextArea } from "./ui/Field";
import { useChangeOrderStatus } from "@/hooks/useData";
import { STATUS } from "@/lib/status";
import type { Order, OrderStatus } from "@/lib/types";

/** Statuses that must come with a reason (mirrors change_order_status). */
const REASON_REQUIRED: OrderStatus[] = ["cancelled", "needs_amendment", "delivery_failed", "hold"];

export function StatusChangeDialog({ order, to, open, onClose }: { order: Order; to: OrderStatus; open: boolean; onClose: () => void }) {
  const change = useChangeOrderStatus(order.brand_id, { inlineErrors: true });
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { change.reset(); setReason(""); setError(null); } }, [open, to]);

  const label = STATUS[to].label;
  const needsReason = REASON_REQUIRED.includes(to);

  const submit = () => {
    if (needsReason && reason.trim().length < 3) { setError(`Tell us why this order is being marked ${label.toLowerCase()}`); return; }
    change.mutate({ id: order.id, to, note: needsReason ? reason : null }, { onSuccess: onClose });
  };

  return (
    <Dialog
      open={open} onClose={onClose} onSubmit={submit} busy={change.isPending} error={change.error ? describeError(change.error) : null} width="sm"
      title={`Mark order ${order.order_number} as ${label}?`}
      description={needsReason ? "This records the new tracking status for everyone." : "Update this order's tracking status."}
      footer={<>
        <Button onClick={onClose} disabled={change.isPending}>Keep as is</Button>
        <Button type="submit" variant={to === "cancelled" ? "danger" : "primary"} loading={change.isPending}>{needsReason ? `Move to ${label}` : "Update status"}</Button>
      </>}
    >
      {needsReason && (
        <TextArea label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} error={error} rows={3} placeholder="What happened with this order?" autoFocus />
      )}
    </Dialog>
  );
}