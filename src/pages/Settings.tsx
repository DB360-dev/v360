import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Copy, RefreshCw, ShoppingBag } from "lucide-react";
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

const APP_SCOPES = [
  "write_assigned_fulfillment_orders", "read_customers", "read_merchant_managed_fulfillment_orders",
  "write_merchant_managed_fulfillment_orders", "write_order_edits", "read_order_edits", "read_orders",
  "write_orders", "read_products", "write_third_party_fulfillment_orders",
];

/** Shopify sends the brand back here after installing their app. */
const INSTALL_REDIRECT_URL = `${import.meta.env.VITE_SUPABASE_URL ?? ""}/functions/v1/shopify-callback`;

function CopyLine({ value, what }: { value: string; what: string }) {
  const copy = () => {
    navigator.clipboard.writeText(value).then(
      () => toast.success(`${what} copied`),
      () => toast.error(`Couldn't copy. Select the ${what.toLowerCase()} and copy it manually.`),
    );
  };
  return (
    <div className="mt-1.5 flex items-start gap-2">
      <code className="block min-w-0 flex-1 select-all break-all rounded border border-line bg-surface px-2 py-1.5 font-mono text-[12.5px] text-ink">
        {value}
      </code>
      <Button type="button" onClick={copy}><Copy className="h-4 w-4" /> Copy</Button>
    </div>
  );
}

function KeysGuide() {
  return (
    <details className="rounded border border-line bg-sunken/40 px-3 py-2.5 text-[13.5px]">
      <summary className="cursor-pointer font-medium">How to get your app keys</summary>
      <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-muted">
        <li>In your Shopify admin, go to <span className="text-ink">Settings → Apps and sales channels → Develop apps</span> and create an app. Any name works.</li>
        <li>
          In the app's configuration, add these access scopes:
          <CopyLine value={APP_SCOPES.join(",")} what="Scopes" />
        </li>
        <li>
          Set both the <span className="text-ink">App URL</span> and the <span className="text-ink">redirect URL</span> to:
          <CopyLine value={INSTALL_REDIRECT_URL} what="URL" />
        </li>
        <li>Under protected customer data, allow access to <span className="text-ink">name, email, phone and address</span>. We need these to deliver the orders.</li>
        <li>Release the version.</li>
        <li>Open the app's settings, copy the <span className="text-ink">Client ID</span> and <span className="text-ink">Secret</span>, and paste them below. When you press Connect store, Shopify asks you to install the app. You don't need to install it yourself.</li>
      </ol>
    </details>
  );
}

function ShopifyCard() {
  const { brand, isOwner } = useActiveBrand();
  const q = useShopifyConnection(brand.id);
  const connect = useConnectShopify(brand.id);
  const disconnect = useDisconnectShopify(brand.id);
  const sync = useSyncShopify(brand.id);
  const [shop, setShop] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [errs, setErrs] = useState<{ shop?: string; id?: string; secret?: string }>({});
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const c = q.data;
  const active = c?.status === "active";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const s = shop.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "") || c?.shop_domain || "";
    const er: typeof errs = {};
    if (!s) er.shop = "Enter your store address";
    else if (!/^[a-z0-9][a-z0-9-]*(\.myshopify\.com)?$/.test(s)) er.shop = "Use your myshopify address, e.g. yourbrand.myshopify.com. Not your custom domain.";
    if (!clientId.trim()) er.id = "Paste the Client ID from your Shopify app";
    if (!clientSecret.trim()) er.secret = "Paste the secret from your Shopify app";
    setErrs(er);
    if (Object.keys(er).length) return;
    connect.mutate({ shop: s, clientId, clientSecret }, {
      onSuccess: () => { setShop(""); setClientId(""); setClientSecret(""); },
    });
  };

  return (
    <Card title="Shopify store" description="Connect your store with your own Shopify app so new orders come in automatically.">
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
            <form onSubmit={submit} noValidate className="max-w-lg space-y-3">
              <KeysGuide />
              {connect.error && (
                <div role="alert" className="flex gap-2 rounded border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13.5px] text-danger">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{describeError(connect.error)}
                </div>
              )}
              <TextField
                label="Store address"
                placeholder={c?.shop_domain ?? "yourbrand.myshopify.com"}
                value={shop}
                onChange={(e) => setShop(e.target.value)}
                error={errs.shop}
                hint={c ? "Leave blank to keep this store, or enter another myshopify address to switch." : "Find it in Shopify admin under Settings, then Domains."}
              />
              <TextField label="Client ID" value={clientId} onChange={(e) => setClientId(e.target.value)} error={errs.id}
                autoComplete="off" spellCheck={false} className="input font-mono" />
              <TextField label="Secret" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} error={errs.secret}
                autoComplete="new-password" spellCheck={false} className="input font-mono"
                hint={active ? "Paste the keys again to update them. They're stored encrypted and never shown again." : "Stored encrypted and never shown again."} />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant={active ? "secondary" : "primary"} loading={connect.isPending}>
                  {active ? "Update keys" : "Connect store"}
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
        <p className="text-[13.5px] text-muted">Your app keys are deleted. To connect again, paste the Client ID and secret again.</p>
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
