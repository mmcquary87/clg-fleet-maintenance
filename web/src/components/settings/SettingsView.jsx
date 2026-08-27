import { useState } from "react";
import { UserPlus, Loader2, CheckCircle2 } from "lucide-react";
import { Card, Field, Input, Select, Button, Alert, Eyebrow } from "../../ds";
import { supabase } from "../../lib/supabaseClient";

const ROLES = ["dispatcher", "mechanic", "admin"];

export default function SettingsView() {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("dispatcher");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [invited, setInvited] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setInvited(null);
    const { data, error: fnError } = await supabase.functions.invoke("invite-user", {
      body: { email: email.trim(), fullName: fullName.trim() || null, role },
    });
    setSubmitting(false);
    if (fnError) {
      setError(fnError.message);
    } else if (data?.error) {
      setError(data.error);
    } else {
      setInvited(data);
      setEmail("");
      setFullName("");
      setRole("dispatcher");
    }
  };

  return (
    <div style={{ padding: "28px", fontFamily: "var(--clg-font-body)", color: "var(--clg-text-body)", maxWidth: 640, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <Eyebrow tone="brand">Settings</Eyebrow>
        <h2 style={{ fontSize: "var(--clg-size-h4)", fontWeight: 700, marginTop: 4 }}>Invite a user</h2>
        <p style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginTop: 4 }}>
          Sends an email invite. They'll set their own password and land signed in — same flow as any other account here.
        </p>
      </div>

      <Card>
        {error && <Alert tone="critical" title="Couldn't send invite" style={{ marginBottom: 16 }}>{error}</Alert>}
        {invited && (
          <Alert tone="brand" title="Invite sent" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <CheckCircle2 size={14} /> {invited.email} invited as {invited.role}.
            </div>
          </Alert>
        )}

        <form onSubmit={onSubmit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <Field label="Email" required>
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@clgdelivers.com" />
            </Field>
            <Field label="Full name" help="Optional">
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Smith" />
            </Field>
          </div>

          <Field label="Role" style={{ marginBottom: 20 }}>
            <Select value={role} onChange={(e) => setRole(e.target.value)} options={ROLES} />
          </Field>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button type="submit" size="sm" disabled={submitting} iconLeft={submitting ? <Loader2 size={14} className="spin" /> : <UserPlus size={14} />}>
              {submitting ? "Sending…" : "Send invite"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
