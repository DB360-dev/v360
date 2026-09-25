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
import { ShippingInvoices } from "@/pages/ShippingInvoices";
import { Settings } from "@/pages/Settings";
import { Activity } from "@/pages/Activity";
import { NotFound } from "@/pages/NotFound";

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
          { path: "orders", element: <Orders /> },
          { path: "orders/:id", element: <OrderDetail /> },
          { path: "dispatch", element: <Dispatch /> },
          { path: "dispatches", element: <Dispatches /> },
          { path: "stock", element: <Inventory /> },
          { path: "invoices", element: <ShippingInvoices /> },
          { path: "activity", element: <Activity /> },
          { path: "settings", element: <Settings /> },
          { path: "*", element: <NotFound /> },
        ],
      }],
    }],
  },
]);
