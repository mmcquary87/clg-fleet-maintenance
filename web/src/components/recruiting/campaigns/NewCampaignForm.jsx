import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { Card, Field, Input, Select, Button, Alert } from "../../../ds";
import { supabase } from "../../../lib/supabaseClient";

const TYPE_OPTIONS = [
  { value: "lane", label: "Lane" },
  { value: "area_code", label: "Area code" },
  { value: "referral", label: "Referral" },
  { value: "job_board", label: "Job board" },
  { value: "event", label: "Event" },
  { value: "other", label: "Other" },
];

export default function NewCampaignForm({ onCancel, onSaved }) {
  const [name, setName] = useState("");
  const [campaignType, setCampaignType] = useState("lane");
  const [laneOrigin, setLaneOrigin] = useState("");
  const [laneDest, setLaneDest] = useState("");
  const [laneLabel, setLaneLabel] = useState("");
  const [areaCodes, setAreaCodes] = useState("");
  const [description, setDescription] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError("Give the campaign a name."); return; }
    if (campaignType === "lane" && (!laneOrigin.trim() || !laneDest.trim())) {
      setError("A lane campaign needs both an origin and a destination zip3."); return;
    }
    const codes = areaCodes.split(",").map((c) => c.trim()).filter(Boolean);
    if (campaignType === "area_code" && codes.length === 0) {
      setError("An area-code campaign needs at least one area code."); return;
    }
    setSubmitting(true);
    setError(null);
    const { error: err } = await supabase.from("campaigns").insert({
      name: name.trim(),
      campaign_type: campaignType,
      lane_origin_zip3: campaignType === "lane" ? laneOrigin.trim() : null,
      lane_dest_zip3: campaignType === "lane" ? laneDest.trim() : null,
      lane_label: campaignType === "lane" ? (laneLabel.trim() || null) : null,
      target_area_codes: campaignType === "area_code" ? codes : null,
      description: description.trim() || null,
      starts_on: startsOn || null,
    });
    setSubmitting(false);
    if (err) {
      setError(err.message.includes("duplicate key") ? "A campaign with this name already exists." : err.message);
    } else {
      onSaved();
    }
  };

  return (
    <Card style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ fontSize: "var(--clg-size-h5)", fontWeight: 700 }}>New campaign</h3>
        <button type="button" onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clg-text-muted)" }}>
          <X size={18} />
        </button>
      </div>

      {error && <Alert tone="critical" style={{ marginBottom: 14 }}>{error}</Alert>}

      <form onSubmit={onSubmit}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16, marginBottom: 20 }}>
          <Field label="Name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Atlanta lane push — Sep" />
          </Field>
          <Field label="Type" required>
            <Select value={campaignType} onChange={(e) => setCampaignType(e.target.value)} options={TYPE_OPTIONS} />
          </Field>

          {campaignType === "lane" && (
            <>
              <Field label="Origin zip3" required>
                <Input value={laneOrigin} onChange={(e) => setLaneOrigin(e.target.value)} placeholder="e.g. 303" />
              </Field>
              <Field label="Destination zip3" required>
                <Input value={laneDest} onChange={(e) => setLaneDest(e.target.value)} placeholder="e.g. 322" />
              </Field>
              <Field label="Lane label" help="Optional, e.g. Atlanta → Jacksonville" style={{ gridColumn: "1 / -1" }}>
                <Input value={laneLabel} onChange={(e) => setLaneLabel(e.target.value)} />
              </Field>
            </>
          )}

          {campaignType === "area_code" && (
            <Field label="Area codes" required help="Comma-separated, e.g. 904, 912, 229" style={{ gridColumn: "1 / -1" }}>
              <Input value={areaCodes} onChange={(e) => setAreaCodes(e.target.value)} />
            </Field>
          )}

          <Field label="Starts on" help="Optional">
            <Input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
          </Field>
          <Field label="Description" help="Optional" style={{ gridColumn: "1 / -1" }}>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          <Button type="submit" size="sm" disabled={submitting}>
            {submitting && <Loader2 size={14} className="spin" />}
            Save campaign
          </Button>
        </div>
      </form>
    </Card>
  );
}
