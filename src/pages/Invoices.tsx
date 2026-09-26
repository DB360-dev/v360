import { useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/ui/PageHeader";
import { ShippingInvoices } from "./ShippingInvoices";
import { Payments } from "./Payments";

const TABS = [
  { key: "shipping", label: "Shipping invoices" },
  { key: "payments", label: "Payments" },
] as const;

/** Invoices: shipping charges we bill the brand, and payments we make to the brand. */
export function Invoices() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((t) => t.key === params.get("tab"))?.key ?? "shipping";

  return (
    <>
      <PageHeader title="Invoices" description="Shipping charges for your orders, and payments to you for delivered orders." />
      <div role="tablist" aria-label="Invoice type" className="-mx-1 mb-4 flex gap-1 overflow-x-auto border-b border-line px-1">
        {TABS.map((t) => (
          <button
            key={t.key} role="tab" aria-selected={t.key === tab}
            onClick={() => setParams(t.key === "shipping" ? {} : { tab: t.key }, { replace: true })}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-[13.5px] ${
              t.key === tab ? "border-primary font-medium text-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "shipping" ? <ShippingInvoices /> : <Payments />}
    </>
  );
}
