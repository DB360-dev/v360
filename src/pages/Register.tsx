import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { MailCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { describeError } from "@/lib/errors";
import { APP_NAME } from "@/lib/app";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { AuthShell } from "./AuthShell";

type Field = "fullName" | "brandName" | "email" | "phone" | "password" | "confirm";

export function Register() {
  const { session } = useAuth();
  const [v, setV] = useState<Record<Field, string>>({ fullName: "", brandName: "", email: "", phone: "", password: "", confirm: "" });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  if (session) return <Navigate to="/" replace />;

  const set = (k: Field) => (e: React.ChangeEvent<HTMLInputElement>) => setV((s) => ({ ...s, [k]: e.target.value }));

  const validate = () => {
    const e: Partial<Record<Field, string>> = {};
    if (v.fullName.trim().length < 2) e.fullName = "Enter your name";
    if (v.brandName.trim().length < 2) e.brandName = "Enter your brand's name";
    else if (v.brandName.trim().length > 120) e.brandName = "Keep the brand name under 120 characters";
    if (!/^\S+@\S+\.\S+$/.test(v.email.trim())) e.email = "Enter a valid email address";
    const digits = v.phone.replace(/\D/g, "");
    if (!digits) e.phone = "Enter a phone number so our team can reach you";
    else if (digits.length < 10 || digits.length > 15) e.phone = "Enter a valid phone number, including country code";
    if (v.password.length < 8) e.password = "Use at least 8 characters";
    if (v.confirm !== v.password) e.confirm = "Passwords don't match";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!validate()) return;
    setBusy(true);
    const email = v.email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signUp({
      email,
      password: v.password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { signup_type: "brand", full_name: v.fullName.trim(), brand_name: v.brandName.trim(), phone: v.phone.trim() },
      },
    });
    setBusy(false);

    if (error) {
      const code = (error as { code?: string }).code;
      if (/already registered|already exists/i.test(error.message) || code === "user_already_exists" || code === "email_exists") {
        setErrors({ email: "An account with this email already exists. Sign in instead." });
      } else if (code === "email_address_invalid" || code === "email_address_not_authorized") {
        setErrors({ email: describeError(error) });
      } else {
        setFormError(describeError(error));
      }
      return;
    }
    // With email confirmation on, there's no session yet: ask them to confirm.
    // (For an email that's already registered, Supabase returns the same shape,
    // so we show the same screen and don't reveal whether it exists.)
    if (!data.session) setSentTo(email);
    // With confirmation off, the session arrives and the router shows the "under review" screen.
  };

  if (sentTo) {
    return (
      <AuthShell title="Confirm your email">
        <div className="flex gap-3 rounded bg-primary-soft p-4 text-[14px]">
          <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
          <p>We've sent a confirmation link to <strong>{sentTo}</strong>. Open it to finish creating your account. Check your spam folder if it doesn't arrive within a few minutes.</p>
        </div>
        <p className="mt-4 text-[13.5px] text-muted">
          After you confirm, our team reviews new brands before orders start flowing. We'll let you know as soon as your account is approved.
        </p>
        <p className="mt-6 text-[13.5px]"><Link to="/login" className="link">Back to sign in</Link></p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Create your account" subtitle={`Set up ${APP_NAME} for your brand. It takes a minute.`}>
      <form onSubmit={submit} noValidate className="space-y-4">
        {formError && <div role="alert" className="rounded bg-danger-soft px-3 py-2 text-[13.5px] text-danger">{formError}</div>}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Your name" autoComplete="name" value={v.fullName} onChange={set("fullName")} error={errors.fullName} autoFocus />
          <TextField label="Brand name" autoComplete="organization" value={v.brandName} onChange={set("brandName")} error={errors.brandName} />
        </div>
        <TextField label="Work email" type="email" autoComplete="email" value={v.email} onChange={set("email")} error={errors.email} />
        <TextField label="Phone" type="tel" autoComplete="tel" value={v.phone} onChange={set("phone")} error={errors.phone} placeholder="Include country code" />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Password" type="password" autoComplete="new-password" value={v.password} onChange={set("password")} error={errors.password} hint="At least 8 characters" />
          <TextField label="Confirm password" type="password" autoComplete="new-password" value={v.confirm} onChange={set("confirm")} error={errors.confirm} />
        </div>
        <Button type="submit" variant="primary" loading={busy} className="w-full">Create account</Button>
        <p className="border-t border-line pt-4 text-center text-[13.5px] text-muted">
          Already have an account? <Link to="/login" className="link font-medium">Sign in</Link>
        </p>
      </form>
    </AuthShell>
  );
}
