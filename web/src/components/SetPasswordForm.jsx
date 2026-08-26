import { useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

export default function SetPasswordForm({ onDone }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (err) {
      setError(err.message);
    } else {
      // Clear the invite/recovery token out of the URL now that it's used
      window.history.replaceState(null, "", window.location.pathname);
      onDone();
    }
  };

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={onSubmit}>
        <div className="auth-title">Set your password</div>
        <div className="auth-sub">Welcome to Fleet Maintenance — choose a password to finish setting up your account.</div>

        {error && <div className="auth-error">{error}</div>}

        <label className="field">
          <span>New password</span>
          <input type="password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="field">
          <span>Confirm password</span>
          <input type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>

        <button className="btn-primary" type="submit" disabled={submitting}>
          {submitting ? <Loader2 size={15} className="spin" /> : <KeyRound size={15} />}
          Set password
        </button>
      </form>
    </div>
  );
}
