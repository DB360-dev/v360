import { useState } from "react";
import { Printer, Receipt } from "lucide-react";
import { useActiveBrand } from "@/context/BrandContext";
import { useShippingInvoiceLines, useShippingInvoices } from "@/hooks/useData";
import { fmtDate, fmtMoney } from "@/lib/format";
import type { InvoicePaymentStatus, ShippingInvoice } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState, ErrorState, SkeletonRows, Spinner } from "@/components/ui/States";

const STATUS_LABEL: Record<InvoicePaymentStatus, string> = { not_paid: "Unpaid", partially_paid: "Partially paid", paid: "Paid" };
const STATUS_CLASS: Record<InvoicePaymentStatus, string> = {
  not_paid: "text-g-problem", partially_paid: "text-g-brand", paid: "text-g-done",
};
const num = (v: number, dp = 2) => Number(v).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

function InvoiceDialog({ invoice, onClose }: { invoice: ShippingInvoice | null; onClose: () => void }) {
  const { brand } = useActiveBrand();
  const lines = useShippingInvoiceLines(brand.id, invoice?.id ?? null);
  if (!invoice) return null;
  return (
    <Dialog open onClose={onClose} width="lg" title={`Shipping charges ${invoice.invoice_number}`}
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
          #shipping-invoice-print-area, #shipping-invoice-print-area * { visibility: visible !important; }
          #shipping-invoice-print-area { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; border: none !important; }
        }
      `}</style>
      <div id="shipping-invoice-print-area" className="rounded-lg border border-slate-300 bg-white p-6 font-sans text-slate-900 sm:p-8">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4 border-b border-slate-300 pb-5">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">V360</h1>
            <p className="mt-0.5 text-xs text-slate-600">Shipping charges: Lahore, PK to Dhaka, BD</p>
          </div>
          <div className="text-right text-xs">
            <p className="text-lg font-bold">SHIPPING INVOICE</p>
            <p className="font-semibold">{invoice.invoice_number}</p>
            <p className="text-slate-600">Date: {fmtDate(invoice.created_at)}</p>
            <p className="text-slate-600">Status: {STATUS_LABEL[invoice.payment_status]}</p>
          </div>
        </div>
        <div className="mb-5 grid gap-4 text-xs sm:grid-cols-2">
          <div>
            <p className="font-bold uppercase tracking-wider text-slate-500">Billed to</p>
            <p className="mt-1 text-sm font-semibold">{brand.name}</p>
          </div>
          <div className="sm:text-right">
            <p className="font-bold uppercase tracking-wider text-slate-500">Shipment</p>
            <p className="mt-1 text-sm font-semibold">{invoice.shipment?.code}</p>
            <p className="text-slate-600">
              {[invoice.shipment?.shipping_partner, invoice.shipment?.tracking_number].filter(Boolean).join(" · ")}
              {invoice.shipment?.dispatched_at ? ` · dispatched ${fmtDate(invoice.shipment.dispatched_at)}` : ""}
            </p>
          </div>
        </div>
        {lines.isLoading ? <Spinner /> : lines.isError ? <ErrorState error={lines.error} onRetry={() => lines.refetch()} /> : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-slate-300 text-xs">
              <thead>
                <tr className="bg-slate-50 font-bold text-slate-800">
                  <th className="border border-slate-300 px-2.5 py-1.5 text-left">Order #</th>
                  <th className="border border-slate-300 px-2.5 py-1.5 text-left">Items shipped from Pakistan</th>
                  <th className="border border-slate-300 px-2.5 py-1.5 text-center">Units</th>
                  <th className="border border-slate-300 px-2.5 py-1.5 text-right">Weight (kg)</th>
                  <th className="border border-slate-300 px-2.5 py-1.5 text-right">Charge (PKR)</th>
                </tr>
              </thead>
              <tbody>
                {lines.data!.map((l) => (
                  <tr key={l.id}>
                    <td className="border border-slate-300 px-2.5 py-1.5 font-medium">{l.order_number}</td>
                    <td className="border border-slate-300 px-2.5 py-1.5">{l.items_summary}</td>
                    <td className="border border-slate-300 px-2.5 py-1.5 text-center font-semibold">{l.pk_units}</td>
                    <td className="border border-slate-300 px-2.5 py-1.5 text-right">{num(l.weight_kg)}</td>
                    <td className="border border-slate-300 px-2.5 py-1.5 text-right font-semibold">{num(l.amount_pkr)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-bold">
                  <td colSpan={2} className="border border-slate-300 px-2.5 py-2 text-right">Total</td>
                  <td className="border border-slate-300 px-2.5 py-2 text-center">{invoice.pk_units}</td>
                  <td className="border border-slate-300 px-2.5 py-2 text-right">{num(invoice.weight_kg)}</td>
                  <td className="border border-slate-300 px-2.5 py-2 text-right">{num(invoice.amount_pkr)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <div className="mt-5 flex flex-wrap items-end justify-between gap-4 text-xs">
          <div className="space-y-0.5 text-slate-600">
            <p>Rate: {num(invoice.freight_bdt_per_kg)} BDT/kg × FX {num(invoice.fx_rate, 4)} ({fmtDate(invoice.fx_rate_date)}) = {num(invoice.freight_bdt_per_kg * invoice.fx_rate)} PKR/kg</p>
            {invoice.bd_units > 0 && (
              <p>{invoice.bd_units} unit{invoice.bd_units > 1 ? "s" : ""} fulfilled from your Bangladesh stock {invoice.bd_units > 1 ? "are" : "is"} not charged.</p>
            )}
          </div>
          <div className="rounded border border-slate-300 bg-slate-50 px-4 py-2 text-right">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Amount due</p>
            <p className="text-lg font-bold">{num(invoice.amount_pkr)} PKR</p>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

export function ShippingInvoices() {
  const { brand } = useActiveBrand();
  const q = useShippingInvoices(brand.id);
  const [viewing, setViewing] = useState<ShippingInvoice | null>(null);
  const unpaid = (q.data ?? []).filter((i) => i.payment_status !== "paid").reduce((s, i) => s + Number(i.amount_pkr), 0);

  return (
    <>
      <PageHeader title="Shipping invoices"
        description="V360's charges for shipping your orders from Lahore to Dhaka, by weight. Units fulfilled from your Bangladesh stock are never charged." />
      {q.isLoading ? <div className="panel"><SkeletonRows rows={4} cols={6} /></div>
        : q.isError ? <div className="panel"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div>
        : q.data!.length === 0 ? (
          <div className="panel"><EmptyState icon={<Receipt className="h-6 w-6" />} title="No shipping invoices yet">
            An invoice appears here when a shipment with your orders leaves the Lahore hub.
          </EmptyState></div>
        ) : (
          <>
            {unpaid > 0 && <p className="mb-3 text-[13.5px]">Outstanding: <span className="font-semibold">{fmtMoney(unpaid, "PKR")}</span></p>}
            <div className="panel overflow-x-auto">
              <table className="w-full min-w-[640px] text-[13.5px]">
                <thead className="table-head"><tr><th>Invoice</th><th>Shipment</th><th>Date</th><th className="text-right">Units</th>
                  <th className="text-right">Weight</th><th className="text-right">Amount</th><th>Status</th><th /></tr></thead>
                <tbody className="table-body">
                  {q.data!.map((inv) => (
                    <tr key={inv.id}>
                      <td className="font-semibold">{inv.invoice_number}</td>
                      <td>{inv.shipment?.code ?? "—"}</td>
                      <td className="text-muted">{fmtDate(inv.created_at)}</td>
                      <td className="text-right">{inv.pk_units}{inv.bd_units > 0 && <span className="text-faint"> (+{inv.bd_units} BD)</span>}</td>
                      <td className="text-right">{Number(inv.weight_kg)} kg</td>
                      <td className="whitespace-nowrap text-right font-semibold">{fmtMoney(inv.amount_pkr, "PKR")}</td>
                      <td className={`font-medium ${STATUS_CLASS[inv.payment_status]}`}>{STATUS_LABEL[inv.payment_status]}</td>
                      <td className="text-right"><Button size="sm" onClick={() => setViewing(inv)}>View</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      <InvoiceDialog invoice={viewing} onClose={() => setViewing(null)} />
    </>
  );
}
