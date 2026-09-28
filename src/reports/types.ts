import type { BrandPerm } from "@/lib/permissions";
import type { WorkbookSpec } from "@/lib/excel";

/** Filters a report can ask for on the Reports page. Reports always cover the active brand only. */
export type FilterKind = "dateRange" | "status";

export interface ReportFilters {
  /** yyyy-mm-dd, inclusive. */
  from: string | null;
  to: string | null;
  status: string | null;
}

export interface ReportContext {
  /** The active brand. Every query is scoped to it. */
  brandId: string;
  brandName: string;
  /** Viewer may see money amounts ("orders.view_money"). Money columns are dropped otherwise. */
  showMoney: boolean;
  can: (p: BrandPerm) => boolean;
  /** Called with progress text while fetching ("Loading orders… 3,000"). */
  progress: (text: string) => void;
}

export interface ReportDef {
  /** Short code shown on the card, e.g. "B1". */
  code: string;
  /** Permission that allows this report. */
  perm: BrandPerm;
  category: string;
  title: string;
  description: string;
  filters: FilterKind[];
  /** Other permissions needed besides `perm` (e.g. "money.view" for finance reports). */
  requires?: BrandPerm[];
  run: (f: ReportFilters, ctx: ReportContext) => Promise<WorkbookSpec>;
}
