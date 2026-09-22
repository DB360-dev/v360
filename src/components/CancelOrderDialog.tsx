import { describeError } from "@/lib/errors";
import { useEffect, useState } from "react";
import { Dialog } from "./ui/Dialog";
import { Button } from "./ui/Button";
import { TextArea } from "./ui/Field";
import { useCancelOrder } from "@/hooks/useData";
import type { Order } from "@/lib/types";

export function CancelOrderDialog({ order, open, onClose }: { order: Order; open: boolean; onClose: () => void }) {
  const cancel = useCancelOrder(order.brand_id, { inlineErrors: true });
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { cancel.reset(); setReason(""); setError(null); } }, [open]);

  const submit = () => {
    if (reason.trim().length < 3) { setError("Tell us why this order is being cancelled"); return; }
    cancel.mutate({ id: order.id, reason }, { onSuccess: onClose });
  };

  return (
    <Dialog
      open={open} onClose={onClose} onSubmit={submit} busy={cancel.isPending} error={cancel.error ? describeError(cancel.error) : null} width="sm"
      title={`Cancel order ${order.order_number}?`}
      description="This stops the order for everyone. It can't be undone from the portal. Cancel it in Shopify too if you haven't."
      footer={<>
        <Button onClick={onClose} disabled={cancel.isPending}>Keep order</Button>
        <Button type="submit" variant="danger" loading={cancel.isPending}>Cancel order</Button>
      </>}
    >
      <TextArea label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} error={error} rows={3} placeholder="e.g. Item out of stock" autoFocus />
    </Dialog>
  );
}
