import type { ReactNode } from "react";
import { Navigate, Outlet, createBrowserRouter, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useBrand } from "@/context/BrandContext";
import { FullPageSpinner } from "@/components/ui/States";
import { Layout } from "@/components/Layout";
import { RouteError } from "@/components/ErrorBoundary";
import { Login } from "@/pages/Login";
import { Register } from "@/pages/Register";
import { ForgotPassword } from "@/pages/ForgotPassword";
import { ResetPassword } from "@/pages/ResetPassword";
import { NoAccess } from "@/pages/NoAccess";
import { Overview } from "@/pages/Overview";
import { Orders } from "@/pages/Orders";
import { OrderDetail } from "@/pages/OrderDetail";
import { Dispatch } from "@/pages/Dispatch";
import { Dispatches } from "@/pages/Dispatches";
import { Inventory } from "@/pages/Inventory";
import { Invoices } from "@/pages/Invoices";
import { Settings } from "@/pages/Settings";
import { Activity } from "@/pages/Activity";
import { NotFound } from "@/pages/NotFound";
import { Team } from "@/pages/Team";
import { Roles } from "@/pages/Roles";
import { Reports } from "@/pages/Reports";
import { reportsFor } from "@/reports";
import type { BrandPerm } from "@/lib/permissions";

/** Signed in? Otherwise to /login (remembering where they were going). */
function RequireAuth() {
  const { session, loading, recovery } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (recovery) return <Navigate to="/reset-password" replace />;
  return <Outlet />;
}

/** Belongs to at least one active brand? */
function RequireBrand() {
  const { brand, loading, error } = useBrand();
  if (loading) return <FullPageSpinner />;
  if (error || !brand) return <NoAccess />;
  return <Outlet />;
}

/**
 * Pages the user's role doesn't allow send them to the overview.
 * Convenience only: the database decides what they can actually read.
 */
function Allow({ perm, anyOf, owner, children }: { perm?: BrandPerm; anyOf?: BrandPerm[]; owner?: boolean; children: ReactNode }) {
  const { can, isOwner } = useBrand();
  const ok = owner ? isOwner : perm ? can(perm) : anyOf ? anyOf.some(can) : true;
  return ok ? <>{children}</> : <Navigate to="/" replace />;
}

/** Reports page: only when the role can open at least one report. */
function AllowReports({ children }: { children: ReactNode }) {
  const { can } = useBrand();
  return reportsFor(can).length > 0 ? <>{children}</> : <Navigate to="/" replace />;
}

export const router = createBrowserRouter([
  { path: "/login", element: <Login />, errorElement: <RouteError /> },
  { path: "/register", element: <Register />, errorElement: <RouteError /> },
  { path: "/forgot-password", element: <ForgotPassword />, errorElement: <RouteError /> },
  { path: "/reset-password", element: <ResetPassword />, errorElement: <RouteError /> },
  {
    element: <RequireAuth />,
    errorElement: <RouteError />,
    children: [{
      element: <RequireBrand />,
      children: [{
        element: <Layout />,
        children: [
          { index: true, element: <Overview /> },
          { path: "orders", element: <Allow perm="orders.view"><Orders /></Allow> },
          { path: "orders/:id", element: <Allow perm="orders.view"><OrderDetail /></Allow> },
          { path: "dispatch", element: <Allow perm="dispatch.view"><Dispatch /></Allow> },
          { path: "dispatches", element: <Allow perm="dispatch.view"><Dispatches /></Allow> },
          { path: "stock", element: <Allow perm="inventory.view"><Inventory /></Allow> },
          { path: "invoices", element: <Allow anyOf={["invoices.view", "money.view"]}><Invoices /></Allow> },
          { path: "reports", element: <AllowReports><Reports /></AllowReports> },
          { path: "activity", element: <Allow perm="activity.view"><Activity /></Allow> },
          { path: "team", element: <Allow owner><Team /></Allow> },
          { path: "roles", element: <Allow owner><Roles /></Allow> },
          { path: "settings", element: <Settings /> },
          { path: "*", element: <NotFound /> },
        ],
      }],
    }],
  },
]);
