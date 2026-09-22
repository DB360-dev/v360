import { useState, type ChangeEvent } from "react";
import { Upload, Download, FileText, CheckCircle2 } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { useImportOrders } from "@/hooks/useData";
import { parseCSV, parseOrdersFromCSV, type ParsedCsvOrder } from "@/lib/csvParser";
import { describeError } from "@/lib/errors";

interface Props {
  brandId: string;
  open: boolean;
  onClose: () => void;
  onDone?: () => void;
}

const SAMPLE_CSV = `Name,Created At,Billing Name,Billing Phone,Email,Billing Address1,Billing City,Billing Province,Billing Zip,Billing Country Code,Currency,Subtotal,Total,Lineitem name,Lineitem sku,Lineitem quantity,Lineitem price
#MAN-1001,2026-09-22T09:00:00Z,Karim Ahmed,+8801700000000,karim@example.com,"House 12 Road 4 Dhanmondi",Dhaka,Dhaka,1207,BD,BDT,4500,4500,Embroidered Lawn Kurti,SKU-KT-01,1,4500
#MAN-1002,2026-09-22T09:00:00Z,Nusrat Jahan,+8801800000000,nusrat@example.com,"Plot 45 Gulshan 2",Dhaka,Dhaka,1212,BD,BDT,8200,8200,Silk Dupatta,SKU-SD-02,2,4100`;

export function ImportOrdersModal({ brandId, open, onClose, onDone }: Props) {
  const importOrders = useImportOrders(brandId, { inlineErrors: true });
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedCsvOrder[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null);
    const f = e.target.files?.[0];
    if (!f) return;

    if (!f.name.endsWith(".csv") && f.type !== "text/csv") {
      setErrorMsg("Please select a valid .csv file.");
      return;
    }

    setFile(f);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target?.result as string;
        const rows = parseCSV(text);
        if (rows.length === 0) {
          setErrorMsg("CSV file is empty or contains no valid rows.");
          setParsed([]);
          return;
        }
        const orders = parseOrdersFromCSV(rows);
        if (orders.length === 0) {
          setErrorMsg("Could not parse any valid order rows from CSV.");
          setParsed([]);
          return;
        }
        setParsed(orders);
      } catch (err) {
        setErrorMsg("Failed to parse CSV file. Please check format.");
        setParsed([]);
      }
    };
    reader.readAsText(f);
  };

  const downloadSample = () => {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "sample_orders_import.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImport = () => {
    if (parsed.length === 0) return;
    importOrders.mutate(parsed, {
      onSuccess: () => {
        setFile(null);
        setParsed([]);
        setErrorMsg(null);
        onDone?.();
        onClose();
      },
    });
  };

  const handleReset = () => {
    setFile(null);
    setParsed([]);
    setErrorMsg(null);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Import CSV Orders"
      description="Upload manual orders via CSV to display and process alongside automated Shopify orders."
      busy={importOrders.isPending}
      error={importOrders.error ? describeError(importOrders.error) : errorMsg}
      width="lg"
      footer={
        <>
          <Button onClick={onClose} disabled={importOrders.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleImport}
            disabled={parsed.length === 0}
            loading={importOrders.isPending}
          >
            Import {parsed.length > 0 ? `${parsed.length} Orders` : ""}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-md border border-line bg-sunken/40 p-3 text-[13px]">
          <div className="flex items-center gap-2 text-muted">
            <FileText className="h-4 w-4 shrink-0 text-primary" />
            <span>Need the correct CSV columns format?</span>
          </div>
          <Button size="sm" variant="ghost" onClick={downloadSample}>
            <Download className="h-3.5 w-3.5" /> Sample CSV
          </Button>
        </div>

        {!file ? (
          <label className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-line p-8 text-center hover:border-primary/50 hover:bg-sunken/30 cursor-pointer transition-colors">
            <Upload className="mb-2 h-8 w-8 text-faint" />
            <span className="text-[14px] font-medium text-ink">Click or drop CSV file here</span>
            <span className="mt-1 text-[12.5px] text-muted">Supports order details, customer info & line items</span>
            <input type="file" accept=".csv" onChange={handleFileChange} className="sr-only" />
          </label>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-md border border-line bg-surface p-3 text-[13.5px]">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <div>
                  <div className="font-medium text-ink">{file.name}</div>
                  <div className="text-[12px] text-muted">{parsed.length} orders parsed successfully</div>
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={handleReset} disabled={importOrders.isPending}>
                Change File
              </Button>
            </div>

            {parsed.length > 0 && (
              <div className="max-h-56 overflow-y-auto rounded-md border border-line text-[12.5px]">
                <table className="w-full text-left">
                  <thead className="bg-sunken sticky top-0 text-muted">
                    <tr>
                      <th className="px-3 py-1.5 font-medium">Order #</th>
                      <th className="px-3 py-1.5 font-medium">Customer</th>
                      <th className="px-3 py-1.5 font-medium">City</th>
                      <th className="px-3 py-1.5 font-medium text-right">Items</th>
                      <th className="px-3 py-1.5 font-medium text-right">Total</th>
                      <th className="px-3 py-1.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {parsed.map((o, idx) => (
                      <tr key={idx} className="hover:bg-sunken/30">
                        <td className="px-3 py-1.5 font-medium text-ink">{o.order_number}</td>
                        <td className="px-3 py-1.5 text-muted">{o.customer_name}</td>
                        <td className="px-3 py-1.5 text-muted">{o.city || "Dhaka"}</td>
                        <td className="px-3 py-1.5 text-right text-muted">{o.items.length}</td>
                        <td className="px-3 py-1.5 text-right font-medium text-ink">
                          {o.currency || "BDT"} {o.order_total}
                        </td>
                        <td className="px-3 py-1.5 text-muted capitalize">{o.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
