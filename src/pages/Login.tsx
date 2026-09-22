import { useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { describeError } from "@/lib/errors";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { AuthShell } from "./AuthShell";
import { APP_NAME } from "@/lib/app";

export function Login() {
  const { session } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [busy, setBusy] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? "/";
  if (session) return <Navigate to={from} replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fe: typeof fieldErrors = {};
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) fe.email = "Enter your email address";
    if (!password) fe.password = "Enter your password";
    setFieldErrors(fe);
    setError(null);
    if (Object.keys(fe).length) return;
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (err) setError(describeError(err));
  };

  return (
    <AuthShell title="Sign in" subtitle="Welcome back. Sign in to manage your orders.">
      <form onSubmit={submit} noValidate className="space-y-4">
        {error && <div role="alert" className="rounded bg-danger-soft px-3 py-2 text-[13.5px] text-danger">{error}</div>}
        <TextField label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={fieldErrors.email} autoFocus />
        <TextField label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={fieldErrors.password} />
        <Button type="submit" variant="primary" loading={busy} className="w-full">Sign in</Button>
        <p className="text-center text-[13.5px]"><Link to="/forgot-password" className="link">Forgot your password?</Link></p>
        <p className="border-t border-line pt-4 text-center text-[13.5px] text-muted">
          New to {APP_NAME}? <Link to="/register" className="link font-medium">Create an account</Link>
        </p>
      </form>
    </AuthShell>
  );
}
