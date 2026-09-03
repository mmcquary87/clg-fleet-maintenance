import { useEffect, useState } from "react";
import { UserPlus, Loader2, CheckCircle2 } from "lucide-react";
import { Card, Field, Input, Select, Button, Alert, Eyebrow, Toggle, Badge } from "../../ds";
import { supabase } from "../../lib/supabaseClient";
import { useUsersAdmin } from "../../hooks/useUsersAdmin";

const ROLES = ["dispatcher", "mechanic", "admin"];

// Single-row config, same pattern as IntakeWizard's approval_threshold --
// this just adds an editable UI for it, since a $/hour rate is something
// CLG will plausibly tune more often than a one-time approval cutoff.
function ShopLaborRatePanel() {
  const [rate, setRate] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    supabase.from("app_settings").select("shop_labor_rate").single().then(({ data }) => {
      setRate(data?.shop_labor_rate != null ? String(data.shop_labor_rate) : "");
      setLoaded(true);
    });
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    const { error: err } = await supabase.from("app_settings").update({ shop_labor_rate: Number(rate) || 0 }).eq("id", true);
    setSaving(false);
    if (err) setError(err.message);
    else setSaved(true);
  };

  return (
    <Card>
      <h3 style={{ fontSize: "var(--clg-size-h5)", fontWeight: 700, marginBottom: 4 }}>Shop labor rate</h3>
      <p style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginBottom: 16 }}>
        Multiplied by the mechanic's logged hours to estimate in-house repair cost when a work order is closed.
        Leave at 0 to skip the estimate and enter cost manually instead.
      </p>
      {error && <Alert tone="critical" title="Couldn't save" style={{ marginBottom: 16 }}>{error}</Alert>}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
        <Field label="Rate ($ / hour)" style={{ maxWidth: 180 }}>
          <Input
            type="number" min="0" step="0.01" disabled={!loaded}
            value={rate}
            onChange={(e) => { setRate(e.target.value); setSaved(false); }}
          />
        </Field>
        <Button size="sm" onClick={save} disabled={saving || !loaded} iconLeft={saving ? <Loader2 size={14} className="spin" /> : null}>
          {saving ? "Saving…" : "Save"}
        </Button>
        {saved && <span style={{ fontSize: 12.5, color: "var(--clg-royal)", fontWeight: 600 }}>Saved</span>}
      </div>
    </Card>
  );
}

function UsersPanel() {
  const { users, loading, error, setCanEditRoster, setCanVoidWorkOrders } = useUsersAdmin();
  const [toggleError, setToggleError] = useState(null);

  const onToggle = async (userId, next) => {
    setToggleError(null);
    const err = await setCanEditRoster(userId, next);
    if (err) setToggleError(err);
  };

  const onToggleVoid = async (userId, next) => {
    setToggleError(null);
    const err = await setCanVoidWorkOrders(userId, next);
    if (err) setToggleError(err);
  };

  return (
    <Card>
      <h3 style={{ fontSize: "var(--clg-size-h5)", fontWeight: 700, marginBottom: 4 }}>Users</h3>
      <p style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginBottom: 16 }}>
        Roster rights controls who can add, edit, or remove records on the driver availability roster.
        Void rights controls who can void/un-void a work order. Admins always have both.
      </p>

      {error && <Alert tone="critical" title="Couldn't load users" style={{ marginBottom: 16 }}>{error}</Alert>}
      {toggleError && <Alert tone="critical" title="Couldn't update permission" style={{ marginBottom: 16 }}>{toggleError}</Alert>}

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "24px 0", justifyContent: "center", color: "var(--clg-cool)" }}>
          <Loader2 size={16} className="spin" /> Loading users…
        </div>
      ) : users.length === 0 ? (
        <div style={{ padding: "24px 0", textAlign: "center", color: "var(--clg-text-muted)", fontSize: 13 }}>No users yet.</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--clg-size-small)" }}>
          <thead>
            <tr>
              {["Name", "Email", "Role", "Roster rights", "Void rights"].map((h) => (
                <th key={h} style={{
                  textAlign: h === "Roster rights" || h === "Void rights" ? "right" : "left", padding: "8px 10px", fontFamily: "var(--clg-font-heading)",
                  fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
                  color: "var(--clg-text-brand)", borderBottom: "2px solid var(--clg-border-default)",
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => (
              <tr key={u.id} style={{ background: i % 2 ? "var(--clg-surface-subtle)" : "transparent" }}>
                <td style={{ padding: "8px 10px", fontWeight: 600, color: "var(--clg-navy)", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                  {u.full_name || "—"}
                </td>
                <td style={{ padding: "8px 10px", color: "var(--clg-text-muted)", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                  {u.email || "—"}
                </td>
                <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                  <Badge tone={u.role === "admin" ? "brand" : "neutral"}>{u.role}</Badge>
                </td>
                <td style={{ padding: "8px 10px", textAlign: "right", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                  <Toggle checked={u.can_edit_roster} onChange={(next) => onToggle(u.id, next)} />
                </td>
                <td style={{ padding: "8px 10px", textAlign: "right", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                  <Toggle checked={u.can_void_work_orders} onChange={(next) => onToggleVoid(u.id, next)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

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
    <div style={{ padding: "28px", fontFamily: "var(--clg-font-body)", color: "var(--clg-text-body)", maxWidth: 800, margin: "0 auto" }}>
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

      <div style={{ marginTop: 32 }}>
        <ShopLaborRatePanel />
      </div>

      <div style={{ marginTop: 32 }}>
        <UsersPanel />
      </div>
    </div>
  );
}
