import { useState } from "react";
import { Loader2, Plus, Image as ImageIcon } from "lucide-react";
import { Button, Input, Select, Badge } from "../../ds";
import { useUnitCheckins } from "../../hooks/useUnitCheckins";
import FileDropzone from "../shared/FileDropzone";

const EVENT_TYPES = [
  { value: "check_in", label: "Check-in (driver dropping off)" },
  { value: "check_out", label: "Check-out (driver picking up)" },
];

function nowLocalDatetime() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function LogForm({ onCancel, onLogged }) {
  const [eventType, setEventType] = useState("check_in");
  const [driverName, setDriverName] = useState("");
  const [occurredAt, setOccurredAt] = useState(nowLocalDatetime());
  const [odometer, setOdometer] = useState("");
  const [fuelPercent, setFuelPercent] = useState("");
  const [conditionNotes, setConditionNotes] = useState("");
  const [photo, setPhoto] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    setSaving(true);
    setError(null);
    const err = await onLogged({
      eventType, driverName, occurredAt: new Date(occurredAt).toISOString(),
      odometer, fuelPercent, conditionNotes, photos: photo ? [photo] : [],
    });
    setSaving(false);
    if (err) setError(err.message || "Couldn't log this event.");
  };

  return (
    <div style={{ border: "1px solid var(--clg-border-subtle)", borderRadius: "var(--clg-radius-md)", padding: 14, marginBottom: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Select value={eventType} onChange={(e) => setEventType(e.target.value)} options={EVENT_TYPES} />
        <Input placeholder="Driver name" value={driverName} onChange={(e) => setDriverName(e.target.value)} />
        <div>
          <div style={{ fontSize: 10, color: "var(--clg-text-muted)", marginBottom: 3 }}>Date/time</div>
          <Input type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Input type="number" placeholder="Odometer" value={odometer} onChange={(e) => setOdometer(e.target.value)} />
          <Input type="number" placeholder="Fuel %" min="0" max="100" value={fuelPercent} onChange={(e) => setFuelPercent(e.target.value)} />
        </div>
        <Input placeholder="Condition notes (damage, issues noticed, etc.)" value={conditionNotes} onChange={(e) => setConditionNotes(e.target.value)} />
        <FileDropzone file={photo} onFileChange={setPhoto} accept="image/*" label="Add a photo (optional)" />
        {error && <div style={{ fontSize: 12, color: "var(--clg-scarlet)" }}>{error}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <Button size="sm" onClick={submit} disabled={saving}>
            {saving ? <Loader2 size={13} className="spin" /> : "Log event"}
          </Button>
          <Button size="sm" variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

export default function UnitCheckinsPanel({ unitId }) {
  const { checkins, photosByCheckin, loading, error, logEvent, signedUrlFor } = useUnitCheckins(unitId);
  const [showForm, setShowForm] = useState(false);
  const [openingPhotoId, setOpeningPhotoId] = useState(null);

  const handleOpenPhoto = async (photo) => {
    setOpeningPhotoId(photo.id);
    const url = await signedUrlFor(photo);
    setOpeningPhotoId(null);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div>
      {!showForm ? (
        <Button size="sm" iconLeft={<Plus size={13} />} onClick={() => setShowForm(true)} style={{ marginBottom: 16 }}>
          Log check-in / check-out
        </Button>
      ) : (
        <LogForm
          onCancel={() => setShowForm(false)}
          onLogged={async (fields) => {
            const err = await logEvent(fields);
            if (!err) setShowForm(false);
            return err;
          }}
        />
      )}

      {error && <div style={{ fontSize: 12, color: "var(--clg-scarlet)", marginBottom: 12 }}>{error}</div>}

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 20, color: "var(--clg-text-muted)" }}>
          <Loader2 size={16} className="spin" />
        </div>
      ) : checkins.length === 0 ? (
        <div style={{ padding: "16px 0", textAlign: "center", color: "var(--clg-text-muted)", fontSize: 13 }}>
          No check-in/check-out events logged for this unit yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {checkins.map((c) => (
            <div key={c.id} style={{ border: "1px solid var(--clg-border-subtle)", borderRadius: "var(--clg-radius-md)", padding: "10px 12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Badge tone={c.event_type === "check_in" ? "brand" : "neutral"}>
                    {c.event_type === "check_in" ? "Check-in" : "Check-out"}
                  </Badge>
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>{c.driver_name || "Driver not recorded"}</span>
                </span>
                <span style={{ fontSize: 11.5, color: "var(--clg-text-muted)" }}>{new Date(c.occurred_at).toLocaleString()}</span>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginTop: 4 }}>
                {c.odometer != null && <>Odometer: {c.odometer.toLocaleString()} · </>}
                {c.fuel_percent != null && <>Fuel: {c.fuel_percent}% · </>}
                {c.condition_notes || "No condition notes"}
              </div>
              {(photosByCheckin[c.id]?.length ?? 0) > 0 && (
                <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  {photosByCheckin[c.id].map((p) => (
                    <button
                      key={p.id} onClick={() => handleOpenPhoto(p)}
                      style={{
                        display: "flex", alignItems: "center", gap: 4, background: "var(--clg-surface-subtle)",
                        border: "1px solid var(--clg-border-subtle)", borderRadius: "var(--clg-radius-sm)",
                        padding: "4px 8px", cursor: "pointer", fontSize: 11, color: "var(--clg-royal)",
                      }}
                    >
                      {openingPhotoId === p.id ? <Loader2 size={12} className="spin" /> : <ImageIcon size={12} />}
                      {p.file_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
