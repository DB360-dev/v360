import { Link } from "react-router-dom";
import { PlugZap, CheckCircle2 } from "lucide-react";
import { useActiveBrand } from "@/context/BrandContext";
import { useNeedsAttention, useRecentActivity, useShopifyConnection, useStatusCounts } from "@/hooks/useData";
import { JOURNEY, STATUS } from "@/lib/status";
import { fmtDateTime, since, daysSince } from "@/lib/format";
import { displayActor, neutralize } from "@/lib/neutral";
import type { OrderStatus } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState, ErrorState, Spinner } from "@/components/ui/States";

const LEG_TAB: Record<string, string> = { confirm: "confirming", prepare: "action", hub: "hub", shipment: "transit", bd: "transit", delivered: "delivered" };

function Pipeline() {
  const { brand } = useActiveBrand();
  const q = useStatusCounts(brand.id);
  if (q.isError) return <div className="panel"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div>;
  const c = q.data ?? {};
  const sum = (ss: OrderStatus[]) => ss.reduce((n, s) => n + (c[s] ?? 0), 0);
  const total = Object.values(c).reduce((n, v) => n + (v ?? 0), 0);
  const attention = sum(["delivery_failed", "returned", "hold", "hub_issue", "needs_amendment"]);

  return (
    <section aria-label="Orders by stage" className="panel overflow-x-auto">
      <div className="flex items-baseline justify-between gap-4 border-b border-line px-4 py-3">
        <div>
          <div className="text-[12.5px] text-muted">Total orders</div>
          <div className={`text-[28px] font-semibold leading-none tracking-tight ${q.isLoading ? "text-faint" : ""}`}>
            {q.isLoading ? "–" : total}
          </div>
        </div>
        <Link to="/orders?tab=all" className="link text-[13px]">View all</Link>
      </div>
      <ol className="flex min-w-[640px]">
        {JOURNEY.map((leg, i) => {
          const n = sum(leg.statuses.filter((s) => s !== "returned" && s !== "delivery_failed"));
          const isYou = leg.key === "prepare" || (leg.key === "confirm" && sum(["new", "needs_amendment"]) > 0);
          return (
            <li key={leg.key} className={`relative flex-1 ${i > 0 ? "border-l border-line" : ""}`}>
              <Link to={`/orders?tab=${LEG_TAB[leg.key]}`} className="block px-4 py-4 hover:bg-sunken/60 focus-visible:bg-sunken/60">
                <div className="text-[12.5px] text-muted">{i + 1}. {leg.label}</div>
                <div className={`mt-1 text-[28px] font-semibold leading-none tracking-tight ${q.isLoading ? "text-faint" : isYou && n > 0 ? "text-g-brand" : ""}`}>
                  {q.isLoading ? "–" : n}
                </div>
                {isYou && n > 0 && <div className="mt-1.5 text-[12px] font-medium text-g-brand">Waiting on you</div>}
              </Link>
            </li>
          );
        })}
      </ol>
      {attention > 0 && (
        <Link to="/orders?tab=attention" className="flex items-center justify-between border-t border-line bg-g-problem-bg/60 px-4 py-2 text-[13.5px] text-g-problem hover:bg-g-problem-bg">
          <span>{attention} {attention === 1 ? "order needs" : "orders need"} attention (hub issues, amendments, failed deliveries or holds)</span>
          <span className="font-medium">View</span>
        </Link>
      )}
    </section>
  );
}

function ShopifyBanner() {
  const { brand, isOwner } = useActiveBrand();
  const q = useShopifyConnection(brand.id);
  if (q.isLoading || q.isError || q.data?.status === "active") return null;
  const status = q.data?.status;
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-g-brand/30 bg-g-brand-bg px-4 py-3 text-g-brand">
      <PlugZap className="h-5 w-5 shrink-0" aria-hidden />
      <p className="flex-1 text-[14px]">
        {status === "uninstalled" ? "Your Shopify store was disconnected, so new orders aren't coming in."
          : status === "error" ? "There's a problem with your Shopify connection. New orders may not be coming in."
          : "Connect your Shopify store so your orders flow in automatically."}
      </p>
      {isOwner ? (
        <Link to="/settings" className="rounded bg-g-brand px-3 py-1.5 text-[13px] font-medium text-white dark:text-bg">Connect Shopify</Link>
      ) : <span className="text-[13px]">Ask your brand owner to connect it in Settings.</span>}
    </div>
  );
}

function NeedsAction() {
  const { brand } = useActiveBrand();
  const q = useNeedsAttention(brand.id);
  return (
    <section className="panel">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2>Waiting on you</h2>
        <Link to="/orders?tab=action" className="link text-[13px]">All</Link>
      </div>
      {q.isLoading ? <Spinner /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.data!.length === 0 ? (
        <EmptyState icon={<CheckCircle2 className="h-6 w-6 text-g-done" />} title="You're all caught up">
          Nothing is waiting on you right now.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {q.data!.map((o) => (
            <li key={o.id}>
              <Link to={`/orders/${o.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-sunken/60">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{o.order_number}</span>
                    <StatusBadge status={o.status} />
                  </div>
                  <p className="mt-1 text-[13px] text-muted">{STATUS[o.status]?.hint}</p>
                </div>
                <span className={`shrink-0 text-[12.5px] ${daysSince(o.status_changed_at) > 2 ? "font-semibold text-g-problem" : "text-faint"}`} title="Time waiting">
                  {since(o.status_changed_at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Activity() {
  const { brand } = useActiveBrand();
  const q = useRecentActivity(brand.id);
  return (
    <section className="panel">
      <div className="border-b border-line px-4 py-3"><h2>Latest updates</h2></div>
      {q.isLoading ? <Spinner /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.data!.length === 0 ? (
        <EmptyState title="No activity yet">Updates on your orders will appear here as they happen.</EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {q.data!.map((e) => (
            <li key={e.id}>
              <Link to={`/orders/${e.order_id}`} className="block px-4 py-2.5 hover:bg-sunken/60">
                <div className="text-[13.5px]">
                  <span className="font-medium">{e.order.order_number}</span>{" "}
                  <span className="text-muted">{e.to_status ? (STATUS[e.to_status]?.label ?? neutralize(e.action)) : neutralize(e.action)}</span>
                </div>
                <div className="text-[12.5px] text-faint">{displayActor(e.actor_label, brand.name)}, {fmtDateTime(e.created_at)}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Overview() {
  const { brand } = useActiveBrand();
  return (
    <>
      <PageHeader title="Overview" description={`Orders for ${brand.name}, updated live.`} />
      <ShopifyBanner />
      <Pipeline />
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <NeedsAction />
        <Activity />
      </div>
    </>
  );
}
