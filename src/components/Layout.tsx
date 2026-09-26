import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Activity, Archive, Boxes, ChevronsUpDown, Home, LogOut, Menu, Monitor, Moon, PackageCheck, Receipt, Settings, Sun, Truck, WifiOff, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useActiveBrand } from "@/context/BrandContext";
import { useTheme, type ThemeChoice } from "@/context/ThemeContext";
import { useStatusCounts } from "@/hooks/useData";
import { useBrandRealtime } from "@/hooks/useRealtime";
import { useOnline } from "@/hooks/useOnline";
import { ErrorBoundary } from "./ErrorBoundary";
import { APP_INITIAL, APP_NAME } from "@/lib/app";
import { NotificationBanner } from "./NotificationBanner";
import { NotificationToggle, NotificationPanel } from "./NotificationArea";

const NAV = [
  { to: "/", label: "Overview", icon: Home, end: true },
  { to: "/orders", label: "Orders", icon: Boxes },
  { to: "/dispatch", label: "Ready to send", icon: PackageCheck, badge: "ready" as const },
  { to: "/dispatches", label: "Dispatches", icon: Truck },
  { to: "/stock", label: "Local stock", icon: Archive },
  { to: "/invoices", label: "Invoices", icon: Receipt },
  { to: "/activity", label: "Latest updates", icon: Activity },
  { to: "/settings", label: "Settings", icon: Settings },
];

function BrandSwitcher() {
  const { brand, brands, setBrandId } = useActiveBrand();
  if (brands.length <= 1) {
    return <div className="truncate px-2 text-[15px] font-semibold" title={brand.name}>{brand.name}</div>;
  }
  return (
    <label className="relative block">
      <span className="sr-only">Switch brand</span>
      <select
        value={brand.id}
        onChange={(e) => setBrandId(e.target.value)}
        className="w-full appearance-none truncate rounded bg-transparent py-1 pl-2 pr-7 text-[15px] font-semibold hover:bg-sunken focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        {brands.map((b) => <option key={b.org.id} value={b.org.id}>{b.org.name}</option>)}
      </select>
      <ChevronsUpDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" aria-hidden />
    </label>
  );
}

function ThemeSwitch() {
  const { choice, setChoice } = useTheme();
  const opts: { v: ThemeChoice; icon: typeof Sun; label: string }[] = [
    { v: "light", icon: Sun, label: "Light" }, { v: "dark", icon: Moon, label: "Dark" }, { v: "system", icon: Monitor, label: "System" },
  ];
  return (
    <div role="radiogroup" aria-label="Theme" className="flex rounded border border-line p-0.5">
      {opts.map(({ v, icon: Icon, label }) => (
        <button
          key={v} role="radio" aria-checked={choice === v} title={label} onClick={() => setChoice(v)}
          className={`grid h-7 flex-1 place-items-center rounded-[4px] ${choice === v ? "bg-sunken text-ink" : "text-faint hover:text-ink"}`}
        >
          <Icon className="h-3.5 w-3.5" /><span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { brand } = useActiveBrand();
  const { user, signOut } = useAuth();
  const counts = useStatusCounts(brand.id).data ?? {};
  const ready = (counts.confirmed ?? 0) + (counts.brand_preparing ?? 0);

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 pt-4 pb-3">
        <div className="mb-2 flex items-center gap-2 px-2 text-[12.5px] text-muted">
          <span className="grid h-5 w-5 place-items-center rounded bg-primary text-[10px] font-bold text-primary-fg" aria-hidden>{APP_INITIAL}</span>
          {APP_NAME}
        </div>
        <BrandSwitcher />
      </div>
      <nav className="flex-1 space-y-0.5 px-3" aria-label="Main">
        {NAV.map(({ to, label, icon: Icon, end, badge }) => (
          <NavLink
            key={to} to={to} end={end} onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded px-2 py-1.5 text-[14px] transition-colors ${
                isActive ? "bg-primary-soft font-medium text-primary" : "text-muted hover:bg-sunken hover:text-ink"}`}
          >
            <Icon className="h-4 w-4" aria-hidden />
            <span className="flex-1">{label}</span>
            {badge === "ready" && ready > 0 && (
              <span className="rounded-full bg-g-brand-bg px-1.5 text-[12px] font-semibold text-g-brand" aria-label={`${ready} orders ready`}>{ready}</span>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="space-y-3 border-t border-line p-3">
        <ThemeSwitch />
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 truncate text-[13px] text-muted" title={user?.email}>{user?.email}</div>
          <button onClick={() => void signOut()} className="rounded p-1.5 text-muted hover:bg-sunken hover:text-ink" title="Sign out">
            <LogOut className="h-4 w-4" /><span className="sr-only">Sign out</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function Layout() {
  const { brand } = useActiveBrand();
  const online = useOnline();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useBrandRealtime(brand.id);
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[236px_1fr] print:block">
      {/* Sidebar Column 1 */}
      <aside className="sticky top-0 hidden h-screen print:!hidden border-r border-line bg-surface lg:block">
        <Sidebar />
      </aside>

      {/* Mobile Drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-[rgb(var(--shadow)/0.45)]" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 border-r border-line bg-surface shadow-pop">
            <button onClick={() => setOpen(false)} className="absolute right-2 top-3 rounded p-1.5 hover:bg-sunken" aria-label="Close menu">
              <X className="h-4 w-4" />
            </button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      {/* Content Column 2 */}
      <div className="flex min-w-0 flex-col min-h-screen">
        {/* Top Header */}
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-surface/90 px-4 py-2.5 sm:px-6 sm:py-3 backdrop-blur-md print:!hidden">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => setOpen(true)} className="rounded p-1.5 hover:bg-sunken lg:hidden" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
            <h2 className="truncate text-[15px] font-semibold text-ink">{brand.name}</h2>
            <span className="hidden rounded bg-sunken px-2 py-0.5 text-[11.5px] font-medium text-muted sm:inline-block">Brand Portal</span>
          </div>
          <div className="relative flex items-center gap-3">
            <NotificationToggle />
            <NotificationPanel />
          </div>
        </header>

        {/* Main Section */}
        <main className="flex-1 min-w-0">
          {!online && (
            <div role="status" className="flex items-center gap-2 bg-g-problem-bg px-6 py-2 text-[13.5px] text-g-problem">
              <WifiOff className="h-4 w-4" aria-hidden /> You're offline. Changes won't save until your connection is back.
            </div>
          )}
          <div className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <NotificationBanner />
            <ErrorBoundary key={location.pathname}><Outlet /></ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
}
