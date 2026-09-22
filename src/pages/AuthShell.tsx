import type { ReactNode } from "react";
import { APP_INITIAL, APP_NAME } from "@/lib/app";

/** Shared frame for sign-in screens. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid min-h-screen bg-bg lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-10 flex items-center gap-2 text-[14px] font-semibold">
            <span className="grid h-7 w-7 place-items-center rounded bg-primary text-[12px] font-bold text-primary-fg" aria-hidden>{APP_INITIAL}</span>
            {APP_NAME}
          </div>
          <h1>{title}</h1>
          {subtitle && <p className="mt-2 text-[14px] text-muted">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </div>
      <aside className="relative hidden overflow-hidden bg-primary lg:block" aria-hidden>
        <div className="absolute inset-0 flex flex-col justify-end p-14 text-primary-fg">
          <svg viewBox="0 0 420 120" className="mb-10 w-full max-w-md opacity-90">
            {["Store", "Hub", "Transit", "Door"].map((label, i) => (
              <g key={label} transform={`translate(${36 + i * 116} 50)`}>
                {i < 3 && <line x1="10" y1="0" x2="106" y2="0" stroke="currentColor" strokeWidth="2" strokeDasharray={i === 1 ? "6 6" : undefined} opacity="0.6" />}
                <circle r="9" fill={i === 3 ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.5" />
                <text y="36" textAnchor="middle" fontSize="13" fill="currentColor" opacity="0.85">{label}</text>
              </g>
            ))}
          </svg>
          <p className="max-w-md text-[26px] font-semibold leading-snug tracking-[-0.01em]">
            Every order, from your Shopify store to your customer's door.
          </p>
          <p className="mt-3 max-w-md text-[15px] opacity-80">
            See confirmations, dispatches, shipments and deliveries in one place, updated as they happen.
          </p>
        </div>
      </aside>
    </div>
  );
}
