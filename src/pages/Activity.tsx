import { Link } from "react-router-dom";
import { Activity as ActivityIcon, ArrowRight, Clock } from "lucide-react";
import { useActiveBrand } from "@/context/BrandContext";
import { useRecentActivity } from "@/hooks/useData";
import { STATUS } from "@/lib/status";
import { fmtDateTime, since } from "@/lib/format";
import { displayActor, neutralize } from "@/lib/neutral";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState, ErrorState, Spinner } from "@/components/ui/States";

export function Activity() {
  const { brand } = useActiveBrand();
  const q = useRecentActivity(brand.id);

  return (
    <>
      <PageHeader
        title="Latest updates"
        description={`Real-time activity log and updates for ${brand.name} orders.`}
      />

      <section className="panel mt-6">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="flex items-center gap-2">
            <ActivityIcon className="h-4 w-4 text-primary" />
            <h2 className="text-[15px] font-semibold text-ink">Recent Order Activity</h2>
          </div>
          {q.data && (
            <span className="text-[12.5px] text-muted">
              {q.data.length} recent {q.data.length === 1 ? "event" : "events"}
            </span>
          )}
        </div>

        {q.isLoading ? (
          <Spinner label="Loading latest updates..." />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : q.data!.length === 0 ? (
          <EmptyState
            icon={<Clock className="h-6 w-6 text-muted" />}
            title="No activity recorded yet"
          >
            Updates on your orders will appear here in real-time as they happen.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {q.data!.map((e) => (
              <li key={e.id} className="transition-colors hover:bg-sunken/50">
                <Link
                  to={`/orders/${e.order_id}`}
                  className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[14px] font-bold text-primary">
                        #{e.order.order_number}
                      </span>
                      {e.to_status && <StatusBadge status={e.to_status} />}
                      <span className="text-[13.5px] font-medium text-ink">
                        {e.to_status ? STATUS[e.to_status]?.label ?? neutralize(e.action) : neutralize(e.action)}
                      </span>
                    </div>

                    {e.note && (
                      <p className="text-[13px] text-muted line-clamp-2 pl-2 border-l-2 border-line">
                        "{neutralize(e.note)}"
                      </p>
                    )}

                    <div className="flex items-center gap-2 text-[12px] text-faint">
                      <span>{displayActor(e.actor_label, brand.name)}</span>
                      <span>•</span>
                      <span>{fmtDateTime(e.created_at)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 text-[12.5px] font-medium text-primary sm:shrink-0">
                    <span>{since(e.created_at)}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
