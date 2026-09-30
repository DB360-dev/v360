import { useEffect, useId, useRef, useState } from "react";
import { TextField } from "./ui/Field";

/** Sent by the brand's own rider or a ride-hailing app: no courier consignment number exists. */
export const MANUAL_COURIER = "Manual (InDrive/Uber)";
export const COURIERS = ["TCS", "Leopards", "M&P", "Trax", "PostEx", "BlueEx", "Call Courier", MANUAL_COURIER, "Hand delivery"];
const NO_TRACKING = [MANUAL_COURIER, "Hand delivery"];
const OTHER = "__other";

/** Couriers that issue a consignment number the hub can track the parcel by. */
export function courierNeedsTracking(courier: string): boolean {
  return !NO_TRACKING.includes(courier.trim());
}

/** Courier picker: the known couriers as a dropdown, plus "Other" to type any name. */
export function CourierField({ value, onChange, error }: { value: string; onChange: (courier: string) => void; error?: string | null }) {
  const id = useId();
  const known = COURIERS.includes(value);
  const [picked, setPicked] = useState(false);
  const other = picked || (value !== "" && !known);
  // Leave "Other" when the form resets the value to a listed courier, but not while the user is typing a name.
  const typing = useRef(false);
  useEffect(() => {
    if (known && !typing.current) setPicked(false);
    typing.current = false;
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={id} className="field-label">Courier</label>
        <select
          id={id} className="input" value={other ? OTHER : value} aria-invalid={!other && !!error}
          onChange={(e) => {
            if (e.target.value === OTHER) { setPicked(true); onChange(""); }
            else { setPicked(false); onChange(e.target.value); }
          }}
        >
          {!other && !known && <option value="">Choose a courier</option>}
          {COURIERS.map((c) => <option key={c} value={c}>{c === MANUAL_COURIER ? "Manual dispatch (InDrive / Uber)" : c}</option>)}
          <option value={OTHER}>Other courier…</option>
        </select>
        {!other && error && <p role="alert" className="mt-1.5 text-[13px] text-danger">{error}</p>}
      </div>
      {other && (
        <TextField label="Courier name" value={value} onChange={(e) => { typing.current = true; onChange(e.target.value); }} error={error} autoComplete="off" autoFocus placeholder="e.g. Daewoo Express" />
      )}
    </div>
  );
}
