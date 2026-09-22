import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Membership, MemberRole, Organization } from "@/lib/types";
import { useAuth } from "./AuthContext";

const KEY = "portal-active-brand";

interface BrandCtx {
  brands: { org: Organization; role: MemberRole }[];
  brand: Organization | null;
  role: MemberRole | null;
  isOwner: boolean;
  /** Signed-in user belongs to an internal operations team, not a brand. */
  isOpsUser: boolean;
  /** Brands this user registered that are awaiting approval, or were rejected. */
  pendingBrands: Organization[];
  rejectedBrands: Organization[];
  setBrandId: (id: string) => void;
  loading: boolean;
  error: unknown;
  refetch: () => void;
}

const Ctx = createContext<BrandCtx | null>(null);

export function BrandProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [activeId, setActiveId] = useState<string | null>(() => {
    try { return localStorage.getItem(KEY); } catch { return null; }
  });

  const q = useQuery({
    queryKey: ["memberships", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("memberships")
        .select("role, organization:organizations(id, name, type, slug, is_active, approval_status, review_note)")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []) as unknown as Membership[];
    },
  });

  const brands = useMemo(
    () => (q.data ?? [])
      .filter((m) => m.organization?.type === "brand" && m.organization.is_active)
      .map((m) => ({ org: m.organization, role: m.role }))
      .sort((a, b) => a.org.name.localeCompare(b.org.name)),
    [q.data],
  );
  const isOpsUser = (q.data ?? []).some((m) => m.organization && m.organization.type !== "brand");
  const brandOrgs = (q.data ?? []).map((m) => m.organization).filter((o) => o?.type === "brand" && !o.is_active);
  const pendingBrands = brandOrgs.filter((o) => o.approval_status === "pending");
  const rejectedBrands = brandOrgs.filter((o) => o.approval_status === "rejected");

  const current = brands.find((b) => b.org.id === activeId) ?? brands[0] ?? null;

  useEffect(() => {
    if (current && current.org.id !== activeId) setActiveId(current.org.id);
  }, [current, activeId]);

  const setBrandId = (id: string) => {
    setActiveId(id);
    try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
  };

  return (
    <Ctx.Provider value={{
      brands, brand: current?.org ?? null, role: current?.role ?? null, isOwner: current?.role === "brand_owner",
      isOpsUser, pendingBrands, rejectedBrands, setBrandId, loading: q.isLoading, error: q.error, refetch: () => void q.refetch(),
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useBrand() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useBrand must be used inside BrandProvider");
  return c;
}

/** For pages that only render once a brand is selected. */
export function useActiveBrand() {
  const { brand, ...rest } = useBrand();
  if (!brand) throw new Error("No active brand");
  return { brand, ...rest };
}
