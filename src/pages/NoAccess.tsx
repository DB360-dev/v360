import { Clock, XCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useBrand } from "@/context/BrandContext";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/States";
import { AuthShell } from "./AuthShell";

/** Shown when the user has no approved brand: pending review, rejected, ops account, or not linked. */
export function NoAccess() {
  const { user, signOut } = useAuth();
  const { isOpsUser, pendingBrands, rejectedBrands, error, refetch } = useBrand();

  const actions = (
    <div className="mt-6 flex gap-2">
      <Button onClick={refetch}>Check again</Button>
      <Button variant="ghost" onClick={() => void signOut()}>Sign out</Button>
    </div>
  );

  if (error) {
    return <AuthShell title="We couldn't load your account"><ErrorState error={error} onRetry={refetch} title="Account didn't load" /></AuthShell>;
  }

  if (pendingBrands.length > 0) {
    const name = pendingBrands[0].name;
    return (
      <AuthShell title="Your account is being reviewed">
        <div className="flex gap-3 rounded bg-g-brand-bg p-4 text-[14px] text-g-brand">
          <Clock className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p>Thanks for registering <strong>{name}</strong>. Our team reviews every new brand before orders start flowing.</p>
        </div>
        <p className="mt-4 text-[13.5px] text-muted">We'll contact you at {user?.email}. Once approved, sign in again (or press "Check again") to connect your Shopify store.</p>
        {actions}
      </AuthShell>
    );
  }

  if (rejectedBrands.length > 0) {
    const b = rejectedBrands[0];
    return (
      <AuthShell title="We couldn't approve this account">
        <div className="flex gap-3 rounded bg-danger-soft p-4 text-[14px] text-danger">
          <XCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p>The registration for <strong>{b.name}</strong> wasn't approved.{b.review_note ? ` Reason: ${b.review_note}` : ""}</p>
        </div>
        <p className="mt-4 text-[13.5px] text-muted">If you think this is a mistake, contact support.</p>
        {actions}
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={isOpsUser ? "This is the brand portal" : "Your account isn't linked to a brand yet"}
      subtitle={isOpsUser
        ? "This is an operations account. Use the operations dashboard instead."
        : `You're signed in as ${user?.email}, but no brand is linked to this account. Ask your account manager to add you, or register a new brand.`}
    >
      {actions}
    </AuthShell>
  );
}
