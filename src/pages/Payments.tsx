import { useState } from "react";
import { Printer, Wallet } from "lucide-react";
import { useActiveBrand } from "@/context/BrandContext";
import { usePayoutInvoices } from "@/hooks/useData";
import { fmtDate, fmtMoney } from "@/lib/format";
import { masterStatus } from "@/lib/status";
import type { InvoicePaymentStatus, PayoutInvoice } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/States";

// From the brand's side these are payments coming to them.
const STATUS_LABEL: Record<InvoicePaymentStatus, string> = { not_paid: "Pending", partially_paid: "Partially paid", paid: "Paid" };
const STATUS_CLASS: Record<InvoicePaymentStatus, string> = {
  not_paid: "text-g-brand", partially_paid: "text-g-brand", paid: "text-g-done",
};
const num = (v: number) => Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function PaymentDialog({ invoice, onClose }: { invoice: PayoutInvoice | null; onClose: () => void }) {
  const { brand } = useActiveBrand();
  if (!invoice) return null;
  const l = invoice.lines;
  const pct = l?.v360_commission_pct ?? 0;
  return (
    <Dialog open onClose={onClose} width="lg" title={`Payment ${invoice.invoice_number}`}
      footer={<>
        <Button onClick={onClose}>Close</Button>
        <Button variant="primary" onClick={() => window.print()}><Printer className="h-4 w-4" /> Save as PDF / Print</Button>
      </>}>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 10mm 12mm; }
          html, body { background: #fff !important; height: auto !important; overflow: visible !important; }
          body * { visibility: hidden !important; }
          dialog { position: static !important; display: block !important; width: 100% !important; max-width: none !important;
            max-height: none !important; margin: 0 !important; padding: 0 !important; border: none !important;
            box-shadow: none !important; background: transparent !important; overflow: visible !important; }
          dialog::backdrop { display: none !important; }
          #payment-print-area, #payment-print-area * { visibility: visible !important; }
          #payment-print-area { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; border: none !important; }
        }
      `}</style>
      <div id="payment-print-area" className="rounded-lg border border-slate-300 bg-white p-6 font-sans text-slate-900 sm:p-8">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4 border-b border-slate-300 pb-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Paid to</p>
            <p className="mt-1 text-lg font-bold">{brand.name}</p>
          </div>
          <div className="text-right text-xs">
            <p className="text-lg font-bold">PAYMENT STATEMENT</p>
            <p className="font-semibold">{invoice.invoice_number}</p>
            <p className="text-slate-600">Date: {fmtDate(invoice.created_at)}</p>
            <p className="text-slate-600">Status: {STATUS_LABEL[invoice.payment_status]}</p>
          </div>
        </div>

        {l?.orders?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-slate-300 text-xs">
              <thead>
                <tr className="bg-slate-50 font-bold text-slate-800">
                  <th className="border border-slate-300 px-2.5 py-1.5 text-left">Order #</th>
                  <th className="border border-slate-300 px-2.5 py-1.5 text-left">Outcome</th>
                  <th className="border border-slate-300 px-2.5 py-1.5 text-right">Order value</th>
                  <th className="border border-slate-300 px-2.5 py-1.5 text-right">Commission</th>
                  <th className="border border-slate-300 px-2.5 py-1.5 text-right">Return deduction</th>
                  <th className="border border-slate-300 px-2.5 py-1.5 text-right">Payable</th>
                </tr>
              </thead>
              <tbody>
                {l.orders.map((o) => (
                  <tr key={o.order_id}>
                    <td className="border border-slate-300 px-2.5 py-1.5 font-medium">{o.order_number}</td>
                    <td className="border border-slate-300 px-2.5 py-1.5">{masterStatus(o.status).label}</td>
                    <td className="border border-slate-300 px-2.5 py-1.5 text-right">{num(o.value)}</td>
                    <td className="border border-slate-300 px-2.5 py-1.5 text-right">{o.commission ? `−${num(o.commission)}` : "—"}</td>
                    <td className="border border-slate-300 px-2.5 py-1.5 text-right">{o.returned_deduction ? `−${num(o.returned_deduction)}` : "—"}</td>
                    <td className="border border-slate-300 px-2.5 py-1.5 text-right font-semibold">{num(o.payable)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-xs text-slate-600">{invoice.order_count} orders.</p>}

        <div className="mt-5 flex justify-end">
          <table className="text-xs">
            <tbody>
              <tr><td className="py-0.5 pr-6 text-slate-600">Delivered orders</td><td className="text-right">{num(l?.delivered_value ?? 0)}</td></tr>
              <tr><td className="py-0.5 pr-6 text-slate-600">Commission ({pct}% of delivered)</td><td className="text-right">−{num(invoice.net_remaining)}</td></tr>
              <tr><td className="py-0.5 pr-6 text-slate-600">Returned orders: 50% of {num(l?.returned_value ?? 0)}</td><td className="text-right">−{num(invoice.advance_amount)}</td></tr>
              <tr className="border-t border-slate-300 font-bold">
                <td className="pt-1.5 pr-6">Payable to you</td><td className="pt-1.5 text-right text-sm">{num(invoice.payable_amount)} PKR</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </Dialog>
  );
}

/** Payment invoices raised for this brand: delivered value less commission and returns. */
export function Payments() {
  const { brand } = useActiveBrand();
  const q = usePayoutInvoices(brand.id);
  const [viewing, setViewing] = useState<PayoutInvoice | null>(null);
  const pending = (q.data ?? []).filter((i) => i.payment_status !== "paid").reduce((s, i) => s + Number(i.payable_amount), 0);

  return (
    <>
      <p className="mb-4 text-[13.5px] text-muted">
        What we pay you for orders the delivery partner has settled: delivered order value, less commission, less 50% of the value of returned orders.
      </p>
      {q.isLoading ? <div className="panel"><SkeletonRows rows={4} cols={6} /></div>
        : q.isError ? <div className="panel"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div>
        : q.data!.length === 0 ? (
          <div className="panel"><EmptyState icon={<Wallet className="h-6 w-6" />} title="No payments yet">
            A payment appears here once your delivered orders are settled and our team raises your payment invoice.
          </EmptyState></div>
        ) : (
          <>
            {pending > 0 && <p className="mb-3 text-[13.5px]">Pending to you: <span className="font-semibold">{fmtMoney(pending, "PKR")}</span></p>}
            <div className="panel overflow-x-auto">
              <table className="w-full min-w-[720px] text-[13.5px]">
                <thead className="table-head"><tr><th>Invoice</th><th>Date</th><th className="text-right">Orders</th>
                  <th className="text-right">Delivered value</th><th className="text-right">Deductions</th><th className="text-right">Payable</th><th>Status</th><th /></tr></thead>
                <tbody className="table-body">
                  {q.data!.map((inv) => (
                    <tr key={inv.id}>
                      <td className="font-semibold">{inv.invoice_number}</td>
                      <td className="text-muted">{fmtDate(inv.created_at)}</td>
                      <td className="text-right">{inv.order_count}</td>
                      <td className="whitespace-nowrap text-right">{fmtMoney(inv.lines?.delivered_value ?? inv.total_value, "PKR")}</td>
                      <td className="whitespace-nowrap text-right text-muted">−{fmtMoney(Number(inv.net_remaining) + Number(inv.advance_amount), "PKR")}</td>
                      <td className="whitespace-nowrap text-right font-semibold">{fmtMoney(inv.payable_amount, "PKR")}</td>
                      <td className={`font-medium ${STATUS_CLASS[inv.payment_status]}`}>{STATUS_LABEL[inv.payment_status]}</td>
                      <td className="text-right"><Button size="sm" onClick={() => setViewing(inv)}>View</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      <PaymentDialog invoice={viewing} onClose={() => setViewing(null)} />
    </>
  );
}
