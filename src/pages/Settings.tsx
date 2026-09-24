import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, RefreshCw, ShoppingBag } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { describeError } from "@/lib/errors";
import { fmtDateTime } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";
import { useActiveBrand } from "@/context/BrandContext";
import { useTheme, type ThemeChoice } from "@/context/ThemeContext";
import { useConnectShopify, useDisconnectShopify, useShopifyConnection, useSyncShopify } from "@/hooks/useData";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TextField } from "@/components/ui/Field";
import { ErrorState, Spinner } from "@/components/ui/States";
import type { StatusGroup } from "@/lib/status";

function Card({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="panel grid gap-4 p-5 md:grid-cols-[240px_1fr] md:gap-8">
      <div><h2>{title}</h2>{description && <p className="mt-1 text-[13.5px] text-muted">{description}</p>}</div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

const CONN: Record<string, { label: string; group: StatusGroup }> = {
  active: { label: "Connected", group: "done" },
  pending: { label: "Not finished", group: "brand" },
  error: { label: "Needs attention", group: "problem" },
  uninstalled: { label: "Disconnected", group: "problem" },
};

function ShopifyCard() {
  const { brand, isOwner } = useActiveBrand();
  const q = useShopifyConnection(brand.id);
  const connect = useConnectShopify(brand.id);
  const disconnect = useDisconnectShopify(brand.id);
  const sync = useSyncShopify(brand.id);
  const [shop, setShop] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const s = shop.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "") || q.data?.shop_domain || "";
    if (!s) { setErr("Enter your store address"); return; }
    if (!/^[a-z0-9][a-z0-9-]*(\.myshopify\.com)?$/.test(s)) { setErr("Use your myshopify address, e.g. yourbrand.myshopify.com. Not your custom domain."); return; }
    setErr(null);
    connect.mutate(s);
  };

  const c = q.data;
  const active = c?.status === "active";

  return (
    <Card title="Shopify store" description="Connect the store, disconnect it, or sync the latest order updates.">
      {q.isLoading ? <Spinner /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
        <div className="space-y-4">
          {c && (
            <div className="flex flex-wrap items-center gap-3">
              <ShoppingBag className="h-5 w-5 text-muted" aria-hidden />
              <span className="font-medium">{c.shop_domain}</span>
              <Pill {...(CONN[c.status] ?? { label: c.status, group: "closed" })} />
            </div>
          )}
          {c && (
            <dl className="grid grid-cols-[140px_1fr] gap-y-1.5 text-[13.5px]">
              <dt className="text-muted">Connected</dt><dd>{fmtDateTime(c.installed_at)}</dd>
              <dt className="text-muted">Last order update</dt><dd>{c.last_synced_at ? fmtDateTime(c.last_synced_at) : "None received yet"}</dd>
            </dl>
          )}
          {!isOwner ? (
            <p className="text-[13.5px] text-muted">Only the brand owner can connect, disconnect, or sync the Shopify store.</p>
          ) : (
            <form onSubmit={submit} noValidate className="space-y-3">
              <TextField
                label="Store address"
                placeholder="yourbrand.myshopify.com"
                value={shop}
                onChange={(e) => setShop(e.target.value)}
                error={err}
                hint={active ? "Leave blank to reconnect this store, or enter another myshopify address to switch." : "Find it in Shopify admin under Settings, then Domains."}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant={active ? "secondary" : "primary"} loading={connect.isPending}>
                  Connect
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  disabled={!active || disconnect.isPending}
                  onClick={() => setConfirmDisconnect(true)}
                >
                  Disconnect
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  disabled={!active}
                  loading={sync.isPending}
                  onClick={() => sync.mutate()}
                >
                  <RefreshCw className="h-4 w-4" /> Sync
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
      <Dialog
        open={confirmDisconnect}
        onClose={() => setConfirmDisconnect(false)}
        title="Disconnect Shopify?"
        description="New orders will stop coming in until you connect the store again. Existing orders in the portal are kept."
        busy={disconnect.isPending}
        footer={
          <>
            <Button onClick={() => setConfirmDisconnect(false)} disabled={disconnect.isPending}>Cancel</Button>
            <Button
              variant="danger"
              loading={disconnect.isPending}
              onClick={() => {
                disconnect.mutate(undefined, {
                  onSuccess: () => setConfirmDisconnect(false),
                });
              }}
            >
              Disconnect store
            </Button>
          </>
        }
      >
        <p className="text-[13.5px] text-muted">You can connect the same store later with the Connect button.</p>
      </Dialog>
    </Card>
  );
}

function ProfileCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("full_name, phone, email").eq("id", user!.id).maybeSingle();
      if (error) throw error;
      return data as { full_name: string | null; phone: string | null; email: string | null } | null;
    },
  });
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  useEffect(() => { if (q.data) { setName(q.data.full_name ?? ""); setPhone(q.data.phone ?? ""); } }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("profiles").update({ full_name: name.trim() || null, phone: phone.trim() || null }).eq("id", user!.id).select("id").single();
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Profile saved"); void qc.invalidateQueries({ queryKey: ["profile"] }); },
    onError: (e) => toast.error(describeError(e)),
  });

  return (
    <Card title="Your profile" description="Used by our team when they need to reach you.">
      {q.isLoading ? <Spinner /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="grid max-w-lg gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><TextField label="Email" value={user?.email ?? ""} disabled hint="Contact support to change your sign-in email." /></div>
          <TextField label="Full name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          <TextField label="Phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
          <div className="sm:col-span-2"><Button type="submit" variant="primary" loading={save.isPending}>Save profile</Button></div>
        </form>
      )}
    </Card>
  );
}

function PasswordCard() {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [errors, setErrors] = useState<{ pw?: string; pw2?: string }>({});
  const change = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Password changed"); setPw(""); setPw2(""); },
    onError: (e) => toast.error(describeError(e)),
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const er: typeof errors = {};
    if (pw.length < 8) er.pw = "Use at least 8 characters";
    if (pw !== pw2) er.pw2 = "Passwords don't match";
    setErrors(er);
    if (!Object.keys(er).length) change.mutate();
  };
  return (
    <Card title="Password">
      <form onSubmit={submit} noValidate className="grid max-w-lg gap-4 sm:grid-cols-2">
        <TextField label="New password" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} error={errors.pw} />
        <TextField label="Confirm new password" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} error={errors.pw2} />
        <div className="sm:col-span-2"><Button type="submit" loading={change.isPending}>Change password</Button></div>
      </form>
    </Card>
  );
}

function AppearanceCard() {
  const { choice, setChoice } = useTheme();
  const opts: { v: ThemeChoice; label: string }[] = [{ v: "light", label: "Light" }, { v: "dark", label: "Dark" }, { v: "system", label: "Match my device" }];
  return (
    <Card title="Appearance">
      <div role="radiogroup" aria-label="Theme" className="flex flex-wrap gap-2">
        {opts.map((o) => (
          <button key={o.v} role="radio" aria-checked={choice === o.v} onClick={() => setChoice(o.v)}
            className={`flex items-center gap-2 rounded border px-3 py-2 text-[13.5px] ${choice === o.v ? "border-primary bg-primary-soft font-medium text-primary" : "border-line hover:border-faint"}`}>
            {choice === o.v && <CheckCircle2 className="h-4 w-4" aria-hidden />}{o.label}
          </button>
        ))}
      </div>
    </Card>
  );
}

export function Settings() {
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const { brand } = useActiveBrand();

  // Result of the Shopify connection redirect
  useEffect(() => {
    const result = params.get("shopify");
    if (!result) return;
    if (result === "connected") {
      toast.success("Shopify connected. New orders will appear automatically.");
      void qc.invalidateQueries({ queryKey: ["brand", brand.id] });
    } else {
      toast.error(params.get("reason") || "Shopify connection didn't finish. Please try again.");
    }
    setParams({}, { replace: true });
  }, [params, setParams, qc, brand.id]);

  return (
    <>
      <PageHeader title="Settings" description={brand.name} />
      <div className="space-y-4">
        <ShopifyCard />
        <ProfileCard />
        <PasswordCard />
        <AppearanceCard />
      </div>
    </>
  );
}
