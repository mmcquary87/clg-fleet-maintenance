import { useState } from "react";
import { LogIn, Loader2, Send } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

function ForgotPasswordForm({ initialEmail, onBack }) {
  const [email, setEmail] = useState(initialEmail);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    setSubmitting(false);
    if (err) setError(err.message);
    else setSent(true);
  };

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={onSubmit}>
        <div className="auth-title">Reset password</div>
        <div className="auth-sub">Enter your email and we'll send you a link to set a new password.</div>

        {error && <div className="auth-error">{error}</div>}
        {sent && <div className="auth-success">If an account exists for that email, a reset link is on its way. Check your inbox (and spam folder).</div>}

        <label className="field">
          <span>Email</span>
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={sent} />
        </label>

        {!sent && (
          <button className="btn-primary" type="submit" disabled={submitting}>
            {submitting ? <Loader2 size={15} className="spin" /> : <Send size={15} />}
            Send reset link
          </button>
        )}

        <button type="button" className="auth-link-btn" style={{ alignSelf: "center" }} onClick={onBack}>
          Back to sign in
        </button>
      </form>
    </div>
  );
}

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [showForgot, setShowForgot] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) setError(err.message);
    setSubmitting(false);
  };

  if (showForgot) {
    return <ForgotPasswordForm initialEmail={email} onBack={() => setShowForgot(false)} />;
  }

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

        <button type="button" className="auth-link-btn" onClick={() => setShowForgot(true)}>
          Forgot password?
        </button>

        <button className="btn-primary" type="submit" disabled={submitting}>
          {submitting ? <Loader2 size={15} className="spin" /> : <LogIn size={15} />}
          Sign in
        </button>

        <div className="auth-hint">Access is invite-only — ask an admin for an invite if you don't have an account.</div>
      </form>
    </div>
  );
}
