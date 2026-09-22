import { describeError } from "@/lib/errors";
import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, Pencil, Truck } from "lucide-react";
import { useActiveBrand } from "@/context/BrandContext";
import { useBatchOrders, useInboundBatches, useUpdateBatch } from "@/hooks/useData";
import { INBOUND_STATUS } from "@/lib/status";
import { fmtDate, fmtDateTime } from "@/lib/format";
import type { InboundBatchOverview } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill, StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TextArea, TextField } from "@/components/ui/Field";
import { EmptyState, ErrorState, SkeletonRows, Spinner } from "@/components/ui/States";

function BatchOrders({ batchId }: { batchId: string }) {
  const { brand } = useActiveBrand();
  const q = useBatchOrders(brand.id, batchId);
  if (q.isLoading) return <Spinner />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <ul className="divide-y divide-line">
      {q.data!.map((o) => (
        <li key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-[13.5px]">
          <Link to={`/orders/${o.id}`} className="w-24 font-semibold hover:underline">{o.order_number}</Link>
          <span className="flex-1 truncate text-muted">{o.customer_name}, {o.item_count} items</span>
          <StatusBadge status={o.status} />
        </li>
      ))}
    </ul>
  );
}

function EditBatchDialog({ batch, onClose }: { batch: InboundBatchOverview | null; onClose: () => void }) {
  const { brand } = useActiveBrand();
  const update = useUpdateBatch(brand.id, { inlineErrors: true });
  const [courier, setCourier] = useState("");
  const [tracking, setTracking] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (batch) { update.reset(); setCourier(batch.courier); setTracking(batch.tracking_number ?? ""); setNotes(batch.notes ?? ""); setErr(null); }
  }, [batch]);

  const submit = () => {
    if (!courier.trim()) { setErr("Enter the courier"); return; }
    update.mutate({ id: batch!.id, courier, tracking, notes }, { onSuccess: onClose });
  };

  return (
    <Dialog open={!!batch} onClose={onClose} onSubmit={submit} busy={update.isPending} error={update.error ? describeError(update.error) : null} title="Edit dispatch details"
      description="You can correct these until the hub receives the parcel."
      footer={<><Button onClick={onClose} disabled={update.isPending}>Cancel</Button><Button type="submit" variant="primary" loading={update.isPending}>Save</Button></>}>
      <div className="space-y-4">
        <TextField label="Courier" value={courier} onChange={(e) => setCourier(e.target.value)} error={err} />
        <TextField label="Consignment / tracking number" value={tracking} onChange={(e) => setTracking(e.target.value)} />
        <TextArea label="Notes for the hub" optional value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
      </div>
    </Dialog>
  );
}

export function Dispatches() {
  const { brand } = useActiveBrand();
  const q = useInboundBatches(brand.id);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<InboundBatchOverview | null>(null);

  return (
    <>
      <PageHeader title="Dispatches" description="Parcels you've sent to the hub, and what the hub has received." />
      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13.5px]">
            <thead className="table-head">
              <tr><th className="w-8" /><th>Sent</th><th>Courier</th><th>Tracking</th><th className="text-right">Orders</th><th>Received at hub</th><th>Status</th><th className="w-10" /></tr>
            </thead>
            {q.isLoading ? <SkeletonRows cols={8} rows={5} /> : (
              <tbody className="table-body">
                {(q.data ?? []).map((b) => {
                  const isOpen = open === b.id;
                  const st = INBOUND_STATUS[b.status];
                  return (
                    <Fragment key={b.id}>
                      <tr className="cursor-pointer hover:bg-sunken/50" onClick={() => setOpen(isOpen ? null : b.id)} aria-expanded={isOpen}>
                        <td className="text-muted">{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                        <td className="whitespace-nowrap">{fmtDate(b.dispatch_date)}</td>
                        <td>{b.courier}</td>
                        <td className="text-muted">{b.tracking_number ?? "—"}</td>
                        <td className="text-right">{b.order_count}</td>
                        <td>
                          <span className={b.issue_count ? "font-medium text-g-problem" : ""}>{b.received_count} of {b.order_count}</span>
                          {b.received_at && <div className="text-[12px] text-faint">{fmtDateTime(b.received_at)}</div>}
                        </td>
                        <td><Pill group={st.group} label={st.label} /></td>
                        <td onClick={(e) => e.stopPropagation()}>
                          {b.status === "in_transit" && (
                            <button className="rounded p-1.5 text-muted hover:bg-sunken hover:text-ink" title="Edit dispatch" onClick={() => setEditing(b)}>
                              <Pencil className="h-3.5 w-3.5" /><span className="sr-only">Edit dispatch</span>
                            </button>
                          )}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr><td colSpan={8} className="bg-sunken/40 !p-0">
                          {b.notes && <p className="border-b border-line px-4 py-2 text-[13px] text-muted">Note: {b.notes}</p>}
                          <BatchOrders batchId={b.id} />
                        </td></tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            )}
          </table>
        </div>
        {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
        {!q.isLoading && !q.isError && q.data!.length === 0 && (
          <EmptyState icon={<Truck className="h-6 w-6" />} title="No dispatches yet" action={<Link to="/dispatch" className="inline-flex h-9 items-center rounded bg-primary px-3.5 text-[14px] font-medium text-primary-fg hover:bg-primary-hover">Go to ready to send</Link>}>
            When you send orders to the hub, each parcel is listed here with what was received.
          </EmptyState>
        )}
      </div>
      <EditBatchDialog batch={editing} onClose={() => setEditing(null)} />
    </>
  );
}
