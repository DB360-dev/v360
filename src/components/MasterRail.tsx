import { Check } from "lucide-react";
import { MASTER_RAIL, STATUS, masterRailIndex } from "@/lib/status";
import type { OrderStatus } from "@/lib/types";

/**
 * Compact thumbnail rail of the master status milestones. Each step is a
 * circle with a short title; done steps are filled, the current one is
 * highlighted (brick red on a problem), upcoming ones stay muted.
 */
export function MasterRail({ status, previousStatus }: { status: OrderStatus; previousStatus?: OrderStatus | null }) {
  const effective = status === "hold" && previousStatus ? previousStatus : status;
  const current = masterRailIndex(effective);
  const cancelled = status === "cancelled";
  const problem = STATUS[status].group === "problem";

  return (
    <ol className="flex flex-wrap items-start gap-x-5 gap-y-4" aria-label="Master status">
      {MASTER_RAIL.map((m, i) => {
        const done = !cancelled && (i < current || (status === "delivered" && i === current));
        const here = !cancelled && i === current && status !== "delivered";
        const tone = here ? (problem ? "problem" : "active") : done ? "done" : "todo";
        return (
          <li key={m.label} className="flex max-w-[92px] flex-col items-center gap-1.5 text-center">
            <span
              aria-hidden
              className={`grid h-6 w-6 place-items-center rounded-full border-2 text-[11px] font-semibold ${
                tone === "done" ? "border-primary bg-primary text-primary-fg"
                : tone === "active" ? "border-primary bg-surface text-primary ring-4 ring-primary/15"
                : tone === "problem" ? "border-g-problem bg-g-problem-bg text-g-problem ring-4 ring-g-problem/15"
                : "border-line bg-surface text-faint"}`}
            >
              {tone === "done" ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
            </span>
            <span className={`text-[12px] leading-tight ${here ? "font-semibold text-ink" : done ? "text-ink" : "text-faint"}`}>
              {m.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}