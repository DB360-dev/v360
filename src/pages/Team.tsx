import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Trash2, UserPlus, Users } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useActiveBrand } from "@/context/BrandContext";
import { useAddStaff, useBrandRoles, useRemoveMember, useSetMemberRole, useTeam } from "@/hooks/useData";
import { describeError } from "@/lib/errors";
import { fmtDate } from "@/lib/format";
import type { RoleRow, TeamMember } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TextField } from "@/components/ui/Field";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/States";

/** Value used in role pickers for the built-in owner role. */
const OWNER = "__owner__";

function roleValue(m: Pick<TeamMember, "role" | "role_id">): string {
  return m.role === "brand_owner" ? OWNER : m.role_id ?? "";
}

function RoleOptions({ roles }: { roles: RoleRow[] }) {
  return (
    <>
      <option value={OWNER}>Owner (full access)</option>
      {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
    </>
  );
}

type Mode = "password" | "invite";

function AddStaffDialog({ brandId, roles, open, onClose }: { brandId: string; roles: RoleRow[]; open: boolean; onClose: () => void }) {
  const add = useAddStaff(brandId, { inlineErrors: true });
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [mode, setMode] = useState<Mode>("password");
  const [password, setPassword] = useState("");
  const [errs, setErrs] = useState<{ email?: string; name?: string; role?: string; password?: string }>({});

  useEffect(() => {
    if (!open) return;
    add.reset();
    setEmail(""); setName(""); setPassword(""); setMode("password"); setErrs({});
    setRole(roles.find((r) => r.name === "Staff")?.id ?? roles[0]?.id ?? OWNER);
  }, [open]); // eslint-disable-line

  const submit = () => {
    const er: typeof errs = {};
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) er.email = "Enter a valid email address";
    if (!name.trim()) er.name = "Enter their full name";
    if (!role) er.role = "Choose a role";
    if (mode === "password" && password.length < 8) er.password = "Use at least 8 characters";
    setErrs(er);
    if (Object.keys(er).length) return;
    add.mutate({
      email, fullName: name,
      role: role === OWNER ? "brand_owner" : "brand_staff",
      roleId: role === OWNER ? null : role,
      password: mode === "password" ? password : null,
    }, { onSuccess: onClose });
  };

  return (
    <Dialog open={open} onClose={onClose} onSubmit={submit} busy={add.isPending} error={add.error ? describeError(add.error) : null}
      title="Add staff"
      description="Give someone access to this brand. If they already have an account, they just get access."
      footer={<>
        <Button onClick={onClose} disabled={add.isPending}>Cancel</Button>
        <Button type="submit" variant="primary" loading={add.isPending}>Add staff</Button>
      </>}>
      <div className="grid gap-4">
        <TextField label="Email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} error={errs.email} autoFocus />
        <TextField label="Full name" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} error={errs.name} />
        <div>
          <label htmlFor="add-staff-role" className="field-label">Role</label>
          <select id="add-staff-role" className="input" value={role} onChange={(e) => setRole(e.target.value)} aria-invalid={!!errs.role}>
            <RoleOptions roles={roles} />
          </select>
          <p className={`mt-1.5 text-[13px] ${errs.role ? "text-danger" : "text-muted"}`}>
            {errs.role ?? (role === OWNER
              ? "Owners can do everything, including managing staff and roles."
              : <>Edit what each role can do on the <Link to="/roles" className="link">Roles</Link> page.</>)}
          </p>
        </div>
        <fieldset>
          <legend className="field-label">How they sign in</legend>
          <div className="flex flex-wrap gap-2">
            {([["password", "Set a password now"], ["invite", "Email an invite"]] as [Mode, string][]).map(([k, label]) => (
              <label key={k} className={`flex cursor-pointer items-center gap-2 rounded border px-3 py-1.5 text-[13.5px] ${mode === k ? "border-primary bg-primary-soft" : "border-line"}`}>
                <input type="radio" name="signin-mode" checked={mode === k} onChange={() => setMode(k)} className="accent-[rgb(var(--primary))]" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        {mode === "password" ? (
          <TextField label="Password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)}
            error={errs.password} hint="At least 8 characters. Share it with them privately; they can change it in Settings." />
        ) : (
          <p className="text-[13px] text-muted">We'll email them a link to set their own password. Ignored if they already have an account.</p>
        )}
      </div>
    </Dialog>
  );
}

function RemoveDialog({ brandId, member, onClose }: { brandId: string; member: TeamMember | null; onClose: () => void }) {
  const remove = useRemoveMember(brandId, { inlineErrors: true });
  useEffect(() => { if (member) remove.reset(); }, [member]); // eslint-disable-line
  const who = member?.full_name || member?.email || "this person";
  return (
    <Dialog open={!!member} onClose={onClose} busy={remove.isPending} width="sm" error={remove.error ? describeError(remove.error) : null}
      onSubmit={() => member && remove.mutate({ membershipId: member.membership_id, name: who }, { onSuccess: onClose })}
      title={`Remove ${who}?`}
      description="They lose access to this brand straight away. Their account itself isn't deleted, and you can add them again later."
      footer={<>
        <Button onClick={onClose} disabled={remove.isPending}>Keep access</Button>
        <Button type="submit" variant="danger" loading={remove.isPending}>Remove access</Button>
      </>}>
      {null}
    </Dialog>
  );
}

/** Brand owners manage who can use the portal for their brand. */
export function Team() {
  const { brand } = useActiveBrand();
  const { user } = useAuth();
  const team = useTeam(brand.id);
  const roles = useBrandRoles(brand.id);
  const setRole = useSetMemberRole(brand.id);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<TeamMember | null>(null);

  const roleList = roles.data ?? [];
  const members = team.data ?? [];

  const change = (m: TeamMember, value: string) => {
    if (!value || value === roleValue(m)) return;
    setRole.mutate({
      membershipId: m.membership_id,
      role: value === OWNER ? "brand_owner" : "brand_staff",
      roleId: value === OWNER ? null : value,
    });
  };

  return (
    <>
      <PageHeader title="Team" description={`People who can use the portal for ${brand.name}, and what each of them can do.`}
        actions={<Button variant="primary" onClick={() => setAdding(true)} disabled={roles.isLoading}><UserPlus className="h-4 w-4" /> Add staff</Button>} />

      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13.5px]">
            <thead className="table-head">
              <tr><th>Name</th><th>Email</th><th>Role</th><th>Added</th><th className="w-12" /></tr>
            </thead>
            {team.isLoading ? <SkeletonRows cols={5} rows={4} /> : (
              <tbody className="table-body">
                {members.map((m) => {
                  const isMe = m.user_id === user?.id;
                  const value = roleValue(m);
                  return (
                    <tr key={m.membership_id}>
                      <td>
                        <span className="font-medium">{m.full_name || "—"}</span>
                        {isMe && <span className="ml-2 rounded bg-sunken px-1.5 py-0.5 text-[11.5px] text-muted">You</span>}
                      </td>
                      <td className="text-muted">{m.email ?? "—"}</td>
                      <td>
                        {isMe ? (
                          <span title="You can't change your own role">{m.role === "brand_owner" ? "Owner" : roleList.find((r) => r.id === m.role_id)?.name ?? "No role"}</span>
                        ) : (
                          <select className="input h-8 w-[220px] py-0 text-[13px]" aria-label={`Role for ${m.full_name || m.email}`}
                            value={value} disabled={setRole.isPending || roles.isLoading} onChange={(e) => change(m, e.target.value)}>
                            {value === "" && <option value="" disabled>No role</option>}
                            <RoleOptions roles={roleList} />
                          </select>
                        )}
                      </td>
                      <td className="whitespace-nowrap text-muted">{fmtDate(m.created_at)}</td>
                      <td>
                        {!isMe && (
                          <button className="rounded p-1.5 text-muted hover:bg-sunken hover:text-danger" title="Remove access" onClick={() => setRemoving(m)}>
                            <Trash2 className="h-4 w-4" /><span className="sr-only">Remove {m.full_name || m.email}</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            )}
          </table>
        </div>
        {team.isError && <ErrorState error={team.error} onRetry={() => team.refetch()} title="Your team didn't load" />}
        {roles.isError && <ErrorState error={roles.error} onRetry={() => roles.refetch()} title="Roles didn't load" />}
        {!team.isLoading && !team.isError && members.length === 0 && (
          <EmptyState icon={<Users className="h-6 w-6" />} title="No one here yet">Add staff so they can help run your orders.</EmptyState>
        )}
      </div>

      <AddStaffDialog brandId={brand.id} roles={roleList} open={adding} onClose={() => setAdding(false)} />
      <RemoveDialog brandId={brand.id} member={removing} onClose={() => setRemoving(null)} />
    </>
  );
}
