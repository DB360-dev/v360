import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import "./index.css";
import { configError } from "@/lib/supabase";
import { queryClient } from "@/lib/queryClient";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import { AuthProvider } from "@/context/AuthContext";
import { BrandProvider } from "@/context/BrandContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ConfigError } from "@/components/ConfigError";
import { router } from "./App";
import { APP_NAME } from "@/lib/app";

document.title = APP_NAME;

function ThemedToaster() {
  const { resolved } = useTheme();
  return <Toaster theme={resolved} position="top-right" richColors closeButton duration={5000} toastOptions={{ style: { fontFamily: "inherit" } }} />;
}

// Log anything that escapes React (failed promises etc.) instead of failing silently.
window.addEventListener("unhandledrejection", (e) => console.error("Unhandled promise rejection", e.reason));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <ErrorBoundary>
        {configError ? <ConfigError message={configError} /> : (
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <BrandProvider>
                <RouterProvider router={router} />
                <ThemedToaster />
              </BrandProvider>
            </AuthProvider>
          </QueryClientProvider>
        )}
      </ErrorBoundary>
    </ThemeProvider>
  </StrictMode>,
);
