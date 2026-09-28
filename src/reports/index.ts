import type { BrandPerm } from "@/lib/permissions";
import type { ReportDef } from "./types";
import { ORDER_REPORTS } from "./orders";
import { DELIVERY_REPORTS, DISPATCH_REPORTS } from "./delivery";
import { PAYMENT_REPORTS, STOCK_REPORTS, TEAM_REPORTS } from "./other";

/** Every report in the brand portal, in display order (categories appear in this order). */
export const REPORTS: ReportDef[] = [
  ...ORDER_REPORTS, ...DISPATCH_REPORTS, ...DELIVERY_REPORTS, ...STOCK_REPORTS, ...PAYMENT_REPORTS, ...TEAM_REPORTS,
];

/** Reports this person may open in the active brand. */
export function reportsFor(can: (p: BrandPerm) => boolean): ReportDef[] {
  return REPORTS.filter((r) => can(r.perm) && (r.requires ?? []).every(can));
}
