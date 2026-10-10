import { useMemo, useState } from "react";
import { Plus, Loader2, History, CalendarClock, ListChecks, Inbox, Check, X } from "lucide-react";
import { Card, Badge, Button, Eyebrow, Alert } from "../../ds";
import { useHomeTime } from "../../hooks/useHomeTime";
import { useHomeTimeRequests } from "../../hooks/useHomeTimeRequests";
import { useProfile } from "../../hooks/useProfile";
import { describeCadence, nextOccurrences } from "../../lib/homeTimeSchedule";
import HomeTimeFormModal from "./HomeTimeFormModal";

function requestStatusTone(status) {
  if (status === "approved") return "brand";
  if (status === "denied") return "critical";
  return "neutral";
}

const LOOKAHEAD_DAYS = 60;
const LOOKAHEAD_PER_DRIVER = 8;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function HomeTimeView({ session }) {
  const { rows, changeLog, loading, error, saveRow, deleteRow } = useHomeTime();
  const { requests, loading: requestsLoading, error: requestsError, decide } = useHomeTimeRequests();
  const { profile, canEditRoster } = useProfile(session.user.id);
  const [view, setView] = useState("schedules");
  const [editingRow, setEditingRow] = useState(undefined);
  const [actionError, setActionError] = useState(null);
  const [decidingId, setDecidingId] = useState(null);

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  const upcoming = useMemo(() => {
    const today = todayStr();
    const entries = rows.flatMap((r) =>
      nextOccurrences(r, today, LOOKAHEAD_PER_DRIVER, LOOKAHEAD_DAYS).map((date) => ({ date, row: r }))
    );
    entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.row.driver_name.localeCompare(b.row.driver_name)));
    return entries;
  }, [rows]);

  const handleSave = async (existingRow, patch, meta) => {
    try {
      await saveRow(existingRow, patch, meta);
      setActionError(null);
    } catch (err) {
      setActionError(err.message);
      throw err;
    }
  };

  const handleDelete = async (row, meta) => {
    try {
      await deleteRow(row, meta);
      setActionError(null);
    } catch (err) {
      setActionError(err.message);
      throw err;
    }
  };

  const handleDecide = async (request, status) => {
    setDecidingId(request.id);
    setActionError(null);
    try {
      await decide(request.id, status, { decidedBy: profile?.full_name || session.user.email });
    } catch (err) {
      setActionError(err.message);
    } finally {
      setDecidingId(null);
    }
  };

  return (
    <div style={{ padding: "28px", fontFamily: "var(--clg-font-body)", color: "var(--clg-text-body)", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <Eyebrow tone="brand">Home Time</Eyebrow>
          <h2 style={{ fontSize: "var(--clg-size-h4)", fontWeight: 700, marginTop: 4 }}>Planned home-time schedules</h2>
          <p style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginTop: 4 }}>
            Standing recurring commitments — feeds Driver Schedule Adherence (KPI 17) once compared against actual activity.
          </p>
        </div>
        {canEditRoster && (
          <Button size="sm" iconLeft={<Plus size={15} />} onClick={() => setEditingRow(null)}>Add schedule</Button>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        <button
          onClick={() => setView("schedules")}
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "7px 13px", fontSize: 12, cursor: "pointer",
            border: "1px solid " + (view === "schedules" ? "var(--clg-royal)" : "var(--clg-reflection)"),
            background: view === "schedules" ? "var(--clg-royal)" : "#fff", color: view === "schedules" ? "#fff" : "var(--clg-pewter)",
          }}
        >
          <ListChecks size={13} /> Schedules
        </button>
        <button
          onClick={() => setView("upcoming")}
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "7px 13px", fontSize: 12, cursor: "pointer",
            border: "1px solid " + (view === "upcoming" ? "var(--clg-royal)" : "var(--clg-reflection)"),
            background: view === "upcoming" ? "var(--clg-royal)" : "#fff", color: view === "upcoming" ? "#fff" : "var(--clg-pewter)",
          }}
        >
          <CalendarClock size={13} /> Upcoming ({LOOKAHEAD_DAYS}d)
        </button>
        <button
          onClick={() => setView("log")}
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "7px 13px", fontSize: 12, cursor: "pointer",
            border: "1px solid " + (view === "log" ? "var(--clg-royal)" : "var(--clg-reflection)"),
            background: view === "log" ? "var(--clg-royal)" : "#fff", color: view === "log" ? "#fff" : "var(--clg-pewter)",
          }}
        >
          <History size={13} /> Change log
        </button>
        <button
          onClick={() => setView("requests")}
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "7px 13px", fontSize: 12, cursor: "pointer",
            border: "1px solid " + (view === "requests" ? "var(--clg-royal)" : "var(--clg-reflection)"),
            background: view === "requests" ? "var(--clg-royal)" : "#fff", color: view === "requests" ? "#fff" : "var(--clg-pewter)",
          }}
        >
          <Inbox size={13} /> Requests{pendingCount > 0 ? ` (${pendingCount})` : ""}
        </button>
      </div>

      {(error || actionError || requestsError) && <Alert tone="critical" style={{ marginBottom: 16 }}>{error || actionError || requestsError}</Alert>}

      <Card padding={0}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "40px 0", justifyContent: "center", color: "var(--clg-cool)" }}>
            <Loader2 size={16} className="spin" /> Loading schedules…
          </div>
        ) : view === "schedules" ? (
          rows.length === 0 ? (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--clg-text-muted)", fontSize: 13 }}>
              No standing home-time schedules yet.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--clg-size-small)" }}>
                <thead>
                  <tr>
                    {["Driver", "Pattern", "Effective", "Approval", "Notes"].map((h) => (
                      <th key={h} style={{
                        textAlign: "left", padding: "10px 14px", fontFamily: "var(--clg-font-heading)",
                        fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
                        color: "var(--clg-text-brand)", borderBottom: "2px solid var(--clg-border-default)", whiteSpace: "nowrap",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr
                      key={r.id} onClick={() => canEditRoster && setEditingRow(r)}
                      style={{ background: i % 2 ? "var(--clg-surface-subtle)" : "transparent", cursor: canEditRoster ? "pointer" : "default" }}
                    >
                      <td style={{ padding: "10px 14px", fontWeight: 600, color: "var(--clg-navy)", borderBottom: "1px solid var(--clg-border-subtle)" }}>{r.driver_name}</td>
                      <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--clg-border-subtle)" }}><Badge tone="brand">{describeCadence(r)}</Badge></td>
                      <td style={{ padding: "10px 14px", fontFamily: "var(--clg-font-mono, monospace)", color: "var(--clg-text-muted)", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                        {r.effective_start_date}{r.effective_end_date ? ` → ${r.effective_end_date}` : " → ongoing"}
                      </td>
                      <td style={{ padding: "10px 14px", color: "var(--clg-text-muted)", borderBottom: "1px solid var(--clg-border-subtle)" }}>{r.approval || "—"}</td>
                      <td style={{ padding: "10px 14px", color: "var(--clg-text-muted)", borderBottom: "1px solid var(--clg-border-subtle)" }}>{r.notes || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : view === "upcoming" ? (
          upcoming.length === 0 ? (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--clg-text-muted)", fontSize: 13 }}>
              No upcoming home-time dates in the next {LOOKAHEAD_DAYS} days.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--clg-size-small)" }}>
                <thead>
                  <tr>
                    {["Date", "Driver", "Pattern"].map((h) => (
                      <th key={h} style={{
                        textAlign: "left", padding: "10px 14px", fontFamily: "var(--clg-font-heading)",
                        fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
                        color: "var(--clg-text-brand)", borderBottom: "2px solid var(--clg-border-default)", whiteSpace: "nowrap",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {upcoming.map((u, i) => (
                    <tr key={`${u.row.id}-${u.date}`} style={{ background: i % 2 ? "var(--clg-surface-subtle)" : "transparent" }}>
                      <td style={{ padding: "10px 14px", fontFamily: "var(--clg-font-mono, monospace)", fontWeight: 600, color: "var(--clg-navy)", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                        {u.date}
                      </td>
                      <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--clg-border-subtle)" }}>{u.row.driver_name}</td>
                      <td style={{ padding: "10px 14px", color: "var(--clg-text-muted)", borderBottom: "1px solid var(--clg-border-subtle)" }}>{describeCadence(u.row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : view === "requests" ? (
          requestsLoading ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "40px 0", justifyContent: "center", color: "var(--clg-cool)" }}>
              <Loader2 size={16} className="spin" /> Loading requests…
            </div>
          ) : requests.length === 0 ? (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--clg-text-muted)", fontSize: 13 }}>
              No home-time requests yet.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {requests.map((r, i) => (
                <div
                  key={r.id}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
                    padding: "12px 18px", background: i % 2 ? "var(--clg-surface-subtle)" : "transparent",
                    borderBottom: i < requests.length - 1 ? "1px solid var(--clg-border-subtle)" : "none",
                  }}
                >
                  <div>
                    <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 14, color: "var(--clg-navy)" }}>
                      {r.driver?.name || "Unknown driver"}
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginTop: 2 }}>
                      {r.start_date}{r.start_date !== r.end_date ? ` → ${r.end_date}` : ""}
                      {r.reason ? ` — ${r.reason}` : ""}
                    </div>
                    {r.status !== "pending" && (
                      <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginTop: 4 }}>
                        {r.status === "approved" ? "Approved" : "Denied"} by {r.decided_by || "—"}
                        {r.decision_note ? ` — ${r.decision_note}` : ""}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    {r.status === "pending" && canEditRoster ? (
                      <>
                        <Button
                          size="sm" iconLeft={decidingId === r.id ? <Loader2 size={13} className="spin" /> : <Check size={13} />}
                          onClick={() => handleDecide(r, "approved")} disabled={decidingId === r.id}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm" variant="outline" iconLeft={<X size={13} />}
                          onClick={() => handleDecide(r, "denied")} disabled={decidingId === r.id}
                        >
                          Deny
                        </Button>
                      </>
                    ) : (
                      <Badge tone={requestStatusTone(r.status)}>{r.status}</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : changeLog.length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--clg-text-muted)", fontSize: 13 }}>
            No changes logged yet.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--clg-size-small)" }}>
              <thead>
                <tr>
                  {["Date", "Changed by", "Driver", "Field", "Old value", "New value", "Reason"].map((h) => (
                    <th key={h} style={{
                      textAlign: "left", padding: "10px 14px", fontFamily: "var(--clg-font-heading)",
                      fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
                      color: "var(--clg-text-brand)", borderBottom: "2px solid var(--clg-border-default)", whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {changeLog.map((c, i) => (
                  <tr key={c.id} style={{ background: i % 2 ? "var(--clg-surface-subtle)" : "transparent" }}>
                    <td style={{ padding: "10px 14px", fontFamily: "var(--clg-font-mono, monospace)", color: "var(--clg-text-muted)", borderBottom: "1px solid var(--clg-border-subtle)", whiteSpace: "nowrap" }}>
                      {new Date(c.changed_at).toLocaleString()}
                    </td>
                    <td style={{ padding: "10px 14px", fontWeight: 600, color: "var(--clg-navy)", borderBottom: "1px solid var(--clg-border-subtle)" }}>{c.changed_by}</td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--clg-border-subtle)" }}>{c.driver_affected}</td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--clg-border-subtle)" }}>{c.field_changed}</td>
                    <td style={{ padding: "10px 14px", color: "var(--clg-text-muted)", borderBottom: "1px solid var(--clg-border-subtle)" }}>{c.old_value || "—"}</td>
                    <td style={{ padding: "10px 14px", color: "var(--clg-text-muted)", borderBottom: "1px solid var(--clg-border-subtle)" }}>{c.new_value || "—"}</td>
                    <td style={{ padding: "10px 14px", color: "var(--clg-text-muted)", maxWidth: 260, borderBottom: "1px solid var(--clg-border-subtle)" }}>{c.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editingRow !== undefined && (
        <HomeTimeFormModal
          row={editingRow}
          onClose={() => setEditingRow(undefined)}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
