import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Copy, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useActiveBrand } from "@/context/BrandContext";
import { useBrandRoles, useDeleteBrandRole, usePermissionCatalog, useSaveBrandRole } from "@/hooks/useData";
import { describeError } from "@/lib/errors";
import { plural } from "@/lib/format";
import type { PermissionDef, RoleRow } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Dialog } from "@/components/ui/Dialog";
import { TextArea, TextField } from "@/components/ui/Field";
import { EmptyState, ErrorState, Spinner } from "@/components/ui/States";

/** Catalog entries grouped by area, in catalog order. */
function groupByArea(catalog: PermissionDef[]): { area: string; perms: PermissionDef[] }[] {
  const groups: { area: string; perms: PermissionDef[] }[] = [];
  for (const p of catalog) {
    const g = groups.find((x) => x.area === p.area);
    if (g) g.perms.push(p); else groups.push({ area: p.area, perms: [p] });
  }
  return groups;
}

type Draft = { id: string | null; name: string; description: string; perms: Set<string> };

function RoleDialog({ brandId, draft, catalog, onClose }: { brandId: string; draft: Draft; catalog: PermissionDef[]; onClose: () => void }) {
  const save = useSaveBrandRole(brandId, { inlineErrors: true });
  const [v, setV] = useState(draft);
  const [nameErr, setNameErr] = useState<string | null>(null);
  useEffect(() => { save.reset(); setV(draft); setNameErr(null); }, [draft]); // eslint-disable-line

  const groups = useMemo(() => groupByArea(catalog), [catalog]);
  const toggle = (keys: string[], on: boolean) => setV((s) => {
    const perms = new Set(s.perms);
    keys.forEach((k) => (on ? perms.add(k) : perms.delete(k)));
    return { ...s, perms };
  });
  const allowed = new Set(catalog.map((p) => p.key));
  const selected = [...v.perms].filter((k) => allowed.has(k));

  const submit = () => {
    if (!v.name.trim()) { setNameErr("Give the role a name"); return; }
    save.mutate({ id: v.id, name: v.name, description: v.description, permissions: selected }, { onSuccess: onClose });
  };

  return (
    <Dialog open onClose={onClose} onSubmit={submit} width="lg" busy={save.isPending} error={save.error ? describeError(save.error) : null}
      title={v.id ? `Edit ${draft.name}` : "New role"}
      description="Tick everything people with this role may see and do. Changes apply the next time they load the portal."
      footer={<>
        <span className="mr-auto self-center text-[13px] text-muted">{selected.length} of {plural(allowed.size, "permission")}</span>
        <Button onClick={onClose} disabled={save.isPending}>Cancel</Button>
        <Button type="submit" variant="primary" loading={save.isPending}>{v.id ? "Save role" : "Create role"}</Button>
      </>}>
      <div className="grid gap-4">
        <TextField label="Role name" value={v.name} maxLength={60} autoFocus error={nameErr}
          onChange={(e) => { setV({ ...v, name: e.target.value }); setNameErr(null); }} placeholder="e.g. Packing team" />
        <TextArea label="Description" optional rows={2} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })}
          placeholder="Who this role is for" />
      </div>

      <div className="mt-5 space-y-4">
        {groups.map((g) => {
          const keys = g.perms.map((p) => p.key);
          const on = keys.filter((k) => v.perms.has(k)).length;
          return (
            <section key={g.area} className="rounded border border-line">
              <label className="flex cursor-pointer items-center gap-2.5 border-b border-line bg-sunken/50 px-3 py-2">
                <Checkbox checked={on === keys.length} indeterminate={on > 0 && on < keys.length}
                  onChange={() => toggle(keys, on < keys.length)} aria-label={`All ${g.area} permissions`} />
                <span className="flex-1 text-[13.5px] font-semibold">{g.area}</span>
                <span className="text-[12px] text-faint">{on} of {keys.length}</span>
              </label>
              <ul className="divide-y divide-line">
                {g.perms.map((p) => (
                  <li key={p.key}>
                    <label className="flex cursor-pointer items-start gap-2.5 px-3 py-2 hover:bg-sunken/40">
                      <Checkbox className="mt-0.5" checked={v.perms.has(p.key)} onChange={(e) => toggle([p.key], e.target.checked)} />
                      <span className="min-w-0">
                        <span className="block text-[13.5px]">{p.label}</span>
                        {p.description && <span className="block text-[12.5px] text-muted">{p.description}</span>}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </Dialog>
  );
}

function RoleCard({ role, catalog, onEdit, onCopy, onDelete }: {
  role: RoleRow; catalog: PermissionDef[]; onEdit: () => void; onCopy: () => void; onDelete: () => void;
}) {
  const allowed = new Set(catalog.map((p) => p.key));
  const granted = new Set(role.role_permissions.map((p) => p.permission).filter((k) => allowed.has(k)));
  const groups = groupByArea(catalog);
  return (
    <li className="panel p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold">{role.name}</h3>
            {role.is_preset && <span className="rounded border border-line bg-sunken px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted">Starter</span>}
          </div>
          {role.description && <p className="mt-0.5 text-[13px] text-muted">{role.description}</p>}
          <p className="mt-1 text-[12.5px] text-faint">{plural(role.member_count, "user")} · {granted.size} of {plural(allowed.size, "permission")}</p>
        </div>
        <div className="flex gap-1">
          <Button size="sm" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
          <Button size="sm" variant="ghost" onClick={onCopy} title="Duplicate" aria-label={`Duplicate ${role.name}`}><Copy className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant="ghost" className="hover:!text-danger" onClick={onDelete} title="Delete" aria-label={`Delete ${role.name}`}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {groups.map((g) => {
          const on = g.perms.filter((p) => granted.has(p.key)).length;
          if (on === 0) return null;
          return (
            <span key={g.area} title={g.perms.filter((p) => granted.has(p.key)).map((p) => p.label).join("\n")}
              className={`rounded-full border px-2 py-0.5 text-[12px] ${on === g.perms.length ? "border-primary/30 bg-primary-soft text-primary" : "border-line text-muted"}`}>
              {g.area}{on < g.perms.length ? ` ${on}/${g.perms.length}` : ""}
            </span>
          );
        })}
        {granted.size === 0 && <span className="text-[12.5px] text-g-problem">No permissions: people with this role only see the overview.</span>}
      </div>
    </li>
  );
}

/** Brand owners build roles for their staff here. */
export function Roles() {
  const { brand } = useActiveBrand();
  const catalog = usePermissionCatalog();
  const roles = useBrandRoles(brand.id);
  const del = useDeleteBrandRole(brand.id, { inlineErrors: true });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<RoleRow | null>(null);

  const cat = catalog.data ?? [];
  const perms = (r: RoleRow) => new Set(r.role_permissions.map((p) => p.permission));
  const edit = (r: RoleRow) => setDraft({ id: r.id, name: r.name, description: r.description ?? "", perms: perms(r) });
  const copy = (r: RoleRow) => setDraft({ id: null, name: `${r.name} (copy)`, description: r.description ?? "", perms: perms(r) });

  if (catalog.isLoading || roles.isLoading) return <Spinner label="Loading roles" />;
  if (catalog.isError || roles.isError) {
    return <div className="panel"><ErrorState error={catalog.error ?? roles.error} onRetry={() => { void catalog.refetch(); void roles.refetch(); }} /></div>;
  }
  const list = roles.data ?? [];

  return (
    <>
      <PageHeader title="Roles" description={<>Build a role for each kind of job, then give people a role on the <Link to="/team" className="link">Team</Link> page.</>}
        actions={<Button variant="primary" onClick={() => setDraft({ id: null, name: "", description: "", perms: new Set() })}><Plus className="h-4 w-4" /> New role</Button>} />

      <ul className="space-y-3">
        <li className="panel flex items-start gap-3 p-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
          <div>
            <h3 className="text-[15px] font-semibold">Owner <span className="ml-1 text-[12px] font-normal text-faint">built-in</span></h3>
            <p className="mt-0.5 text-[13px] text-muted">Every permission, and manages staff and roles. Can't be edited, so you can never lock yourself out.</p>
          </div>
        </li>
        {list.map((r) => (
          <RoleCard key={r.id} role={r} catalog={cat} onEdit={() => edit(r)} onCopy={() => copy(r)} onDelete={() => { del.reset(); setDeleting(r); }} />
        ))}
      </ul>
      {list.length === 0 && (
        <div className="panel mt-3">
          <EmptyState title="No roles yet">Staff need a role before they can see anything beyond the overview.</EmptyState>
        </div>
      )}

      {draft && <RoleDialog brandId={brand.id} draft={draft} catalog={cat} onClose={() => setDraft(null)} />}
      <Dialog open={!!deleting} onClose={() => setDeleting(null)} busy={del.isPending} width="sm"
        error={del.error ? describeError(del.error) : null}
        onSubmit={() => deleting && del.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
        title={deleting ? `Delete ${deleting.name}?` : "Delete role?"}
        description={deleting && deleting.member_count > 0
          ? `${plural(deleting.member_count, "person", "people")} still ${deleting.member_count === 1 ? "has" : "have"} this role. Give them another role on the Team page first.`
          : "This can't be undone."}
        footer={<>
          <Button onClick={() => setDeleting(null)} disabled={del.isPending}>Keep role</Button>
          <Button type="submit" variant="danger" loading={del.isPending}>Delete role</Button>
        </>}>
        {null}
      </Dialog>
    </>
  );
}
