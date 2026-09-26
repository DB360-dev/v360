import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useBulkStatusChange } from "@/hooks/useData";
import { commonBulkActions, type BulkActionKey } from "@/lib/status";
import { plural } from "@/lib/format";
import type { OrderOverview } from "@/lib/types";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";
import { TextArea } from "./ui/Field";

/**
 * "Bulk action" menu for the selected orders. It only offers actions every selected order allows
 * at its current stage; dispatching opens the dispatch dialog, cancelling asks for one reason.
 */
export function BulkActions({ brandId, orders, onDispatch, onDone }: {
  brandId: string;
  orders: OrderOverview[];
  onDispatch: () => void;
  onDone: () => void;
}) {
  const bulk = useBulkStatusChange(brandId);
  const [open, setOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const actions = commonBulkActions(orders.map((o) => o.status));
  const ids = orders.map((o) => o.id);

  const pick = (key: BulkActionKey) => {
    setOpen(false);
    if (key === "dispatch") onDispatch();
    else if (key === "cancelled") setCancelOpen(true);
    else bulk.mutate({ ids, to: key === "ready" ? "brand_preparing" : key }, { onSuccess: onDone });
  };

  return (
    <>
      <div className="relative">
        <Button size="sm" variant="primary" loading={bulk.isPending} disabled={actions.length === 0}
          title={actions.length === 0 ? "The selected orders are at different stages with no action in common" : undefined}
          onClick={() => setOpen((v) => !v)}>
          Bulk action <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </Button>
        {open && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
            <div className="absolute right-0 z-30 mt-1 min-w-[200px] overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lg">
              {actions.map((a) => (
                <button key={a.key} onClick={() => pick(a.key)}
                  className={`block w-full px-3 py-2 text-left text-[13.5px] hover:bg-sunken ${a.key === "cancelled" ? "text-g-problem" : "text-ink"}`}>
                  {a.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <BulkCancelDialog open={cancelOpen} count={ids.length} busy={bulk.isPending} onClose={() => setCancelOpen(false)}
        onConfirm={(reason) => bulk.mutate({ ids, to: "cancelled", note: reason }, { onSuccess: () => { setCancelOpen(false); onDone(); } })} />
    </>
  );
}

function BulkCancelDialog({ open, count, busy, onClose, onConfirm }: {
  open: boolean; count: number; busy: boolean; onClose: () => void; onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setReason(""); setError(null); } }, [open]);

  const submit = () => {
    if (reason.trim().length < 3) { setError("Tell us why these orders are being cancelled"); return; }
    onConfirm(reason);
  };

  return (
    <Dialog
      open={open} onClose={onClose} onSubmit={submit} busy={busy} width="sm"
      title={`Cancel ${plural(count, "order")}?`}
      description="This stops the orders for everyone. It can't be undone from the portal. Cancel them in Shopify too if you haven't."
      footer={<>
        <Button onClick={onClose} disabled={busy}>Keep orders</Button>
        <Button type="submit" variant="danger" loading={busy}>Cancel {plural(count, "order")}</Button>
      </>}
    >
      <TextArea label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} error={error} rows={3} placeholder="e.g. Item out of stock" autoFocus />
    </Dialog>
  );
}
