import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { keys } from "./useData";

/**
 * Live updates: when our team or Shopify changes one of this brand's
 * orders, refresh what's on screen. Database RLS decides what we receive.
 */
export function useBrandRealtime(brandId: string | undefined) {
  const qc = useQueryClient();
  const timer = useRef<number>();

  useEffect(() => {
    if (!brandId) return;
    const refresh = () => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => qc.invalidateQueries({ queryKey: keys.all(brandId) }), 400);
    };
    const channel = supabase
      .channel(`brand-${brandId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `brand_id=eq.${brandId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "inbound_batches", filter: `brand_id=eq.${brandId}` }, refresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "order_events" }, refresh)
      .subscribe();
    return () => {
      window.clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [brandId, qc]);
}
