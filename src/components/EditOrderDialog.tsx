import { describeError } from "@/lib/errors";
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Dialog } from "./ui/Dialog";
import { Button } from "./ui/Button";
import { TextArea, TextField } from "./ui/Field";
import { useUpdateOrder } from "@/hooks/useData";
import type { Order } from "@/lib/types";

const FIELDS = ["customer_name", "customer_phone", "customer_email", "address1", "address2", "city", "province", "zip", "customer_note"] as const;
type FieldKey = (typeof FIELDS)[number];
const RECONFIRM: FieldKey[] = ["customer_phone", "address1", "address2", "city", "province", "zip"];

export function EditOrderDialog({ order, open, onClose }: { order: Order; open: boolean; onClose: () => void }) {
  const update = useUpdateOrder(order.brand_id, { inlineErrors: true });
  const initial = () => Object.fromEntries(FIELDS.map((k) => [k, order[k] ?? ""])) as Record<FieldKey, string>;
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});

  useEffect(() => { if (open) { update.reset(); setV(initial()); setErrors({}); } }, [open]);

  const changed = FIELDS.filter((k) => v[k].trim() !== (order[k] ?? "").trim());
  const needsReconfirm = changed.some((k) => RECONFIRM.includes(k)) && ["confirmed", "brand_preparing"].includes(order.status);

  const set = (k: FieldKey) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));

  const submit = () => {
    const e: Partial<Record<FieldKey, string>> = {};
    if (!v.customer_name.trim()) e.customer_name = "Customer name is required";
    const digits = v.customer_phone.replace(/\D/g, "");
    if (!digits) e.customer_phone = "A phone number is required so we can confirm the order";
    else if (digits.length < 10 || digits.length > 15) e.customer_phone = "Enter a valid phone number, including country code";
    if (v.customer_email.trim() && !/^\S+@\S+\.\S+$/.test(v.customer_email.trim())) e.customer_email = "Enter a valid email address";
    if (!v.address1.trim()) e.address1 = "Address is required";
    if (!v.city.trim()) e.city = "City is required";
    setErrors(e);
    if (Object.keys(e).length) return;
    if (changed.length === 0) { onClose(); return; }
    const changes = Object.fromEntries(changed.map((k) => [k, v[k].trim()]));
    update.mutate({ id: order.id, changes }, { onSuccess: onClose });
  };

  return (
    <Dialog
      open={open} onClose={onClose} onSubmit={submit} busy={update.isPending} error={update.error ? describeError(update.error) : null} width="lg"
      title={`Edit order ${order.order_number}`}
      description="Update the customer's contact and delivery details."
      footer={<>
        <Button onClick={onClose} disabled={update.isPending}>Cancel</Button>
        <Button type="submit" variant="primary" loading={update.isPending} disabled={changed.length === 0}>Save changes</Button>
      </>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Customer name" value={v.customer_name} onChange={set("customer_name")} error={errors.customer_name} autoComplete="off" />
        <TextField label="Phone" type="tel" value={v.customer_phone} onChange={set("customer_phone")} error={errors.customer_phone} placeholder="Include country code" />
        <div className="sm:col-span-2"><TextField label="Email" optional type="email" value={v.customer_email} onChange={set("customer_email")} error={errors.customer_email} /></div>
        <div className="sm:col-span-2"><TextField label="Address" value={v.address1} onChange={set("address1")} error={errors.address1} /></div>
        <div className="sm:col-span-2"><TextField label="Address line 2" optional value={v.address2} onChange={set("address2")} /></div>
        <TextField label="City" value={v.city} onChange={set("city")} error={errors.city} />
        <TextField label="Area / division" optional value={v.province} onChange={set("province")} />
        <TextField label="Postcode" optional value={v.zip} onChange={set("zip")} />
        <div className="sm:col-span-2"><TextArea label="Delivery note" optional value={v.customer_note} onChange={set("customer_note")} rows={2} /></div>
      </div>
      {(needsReconfirm || order.status === "needs_amendment") && changed.length > 0 && (
        <p className="mt-4 flex gap-2 rounded bg-g-brand-bg px-3 py-2 text-[13px] text-g-brand">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Saving sends this order back to be reconfirmed with the customer before it can be dispatched.
        </p>
      )}
    </Dialog>
  );
}
