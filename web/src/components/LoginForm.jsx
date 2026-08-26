import { useState } from "react";
import { LogIn, Loader2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) setError(err.message);
    setSubmitting(false);
  };

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={onSubmit}>
        <div className="auth-title">Fleet Maintenance</div>
        <div className="auth-sub">CLG Transportation · sign in to continue</div>

        {error && <div className="auth-error">{error}</div>}

        <label className="field">
          <span>Email</span>
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>

        <button className="btn-primary" type="submit" disabled={submitting}>
          {submitting ? <Loader2 size={15} className="spin" /> : <LogIn size={15} />}
          Sign in
        </button>

        <div className="auth-hint">Access is invite-only — ask an admin for an invite if you don't have an account.</div>
      </form>
    </div>
  );
}
