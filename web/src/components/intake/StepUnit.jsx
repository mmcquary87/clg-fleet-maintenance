import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Input, Button } from "../../ds";
import { supabase } from "../../lib/supabaseClient";
import UnitInfoCard from "./UnitInfoCard";

export default function StepUnit({ data, setData }) {
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [history, setHistory] = useState([]);

  const lookup = async () => {
    const number = data.unitNumber.trim();
    if (!number) return;
    setSearching(true);
    setNotFound(false);

    const { data: existing } = await supabase.from("units").select("*").ilike("number", number).maybeSingle();

    if (existing) {
      setData((d) => ({ ...d, unitId: existing.id, unitInfo: existing, isNewUnit: false }));
      const { data: pastWO } = await supabase
        .from("work_orders")
        .select("id, category, status, description, complaint, date_opened, date_closed")
        .eq("unit_id", existing.id)
        .order("date_opened", { ascending: false })
        .limit(5);
      setHistory(pastWO ?? []);
    } else {
      setData((d) => ({ ...d, unitId: null, unitInfo: null, isNewUnit: true }));
      setNotFound(true);
    }
    setSearching(false);
  };

  const createUnit = async () => {
    const number = data.unitNumber.trim();
    setSearching(true);
    const { data: created, error } = await supabase.from("units").insert({ number, type: data.newUnitType || "Truck" }).select("*").single();
    setSearching(false);
    if (!error) {
      setData((d) => ({ ...d, unitId: created.id, unitInfo: created, isNewUnit: false }));
      setNotFound(false);
    }
  };

  return (
    <div style={{ display: "flex", gap: 32, padding: "28px 32px", flex: 1 }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 22 }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--clg-navy)", fontWeight: 600, marginBottom: 8 }}>Which unit is this?</div>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1, maxWidth: 220 }}>
              <Input
                value={data.unitNumber}
                onChange={(e) => setData((d) => ({ ...d, unitNumber: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && lookup()}
                placeholder="Unit number, e.g. 3303"
                style={{ fontWeight: 600, fontSize: 14 }}
              />
            </div>
            <Button variant="secondary" onClick={lookup} disabled={searching || !data.unitNumber.trim()}>
              {searching ? <Loader2 size={14} className="spin" /> : "Look up"}
            </Button>
          </div>
          <div style={{ fontSize: 11.5, color: "var(--clg-pewter)", marginTop: 9 }}>
            Pulls whatever we have on file for this unit — driver, location, odometer, last PM, warranty.
            Nothing on file yet? We'll create it.
          </div>
        </div>

        {notFound && (
          <div style={{ border: "1px solid var(--clg-reflection)", padding: "14px 16px", background: "var(--clg-surface-subtle)" }}>
            <div style={{ fontSize: 12, color: "var(--clg-navy)", fontWeight: 600, marginBottom: 8 }}>
              No record for unit {data.unitNumber} — add it
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <select
                value={data.newUnitType || "Truck"}
                onChange={(e) => setData((d) => ({ ...d, newUnitType: e.target.value }))}
                style={{ padding: "9px 12px", border: "1px solid var(--clg-border-default)", fontSize: 13 }}
              >
                <option>Truck</option>
                <option>Trailer</option>
                <option>Van</option>
                <option>Other</option>
              </select>
              <Button size="sm" onClick={createUnit} disabled={searching}>Create unit {data.unitNumber}</Button>
            </div>
          </div>
        )}

        {data.unitInfo && history.length > 0 && (
          <div style={{ border: "1px solid var(--clg-reflection)", padding: "14px 16px", maxWidth: 460 }}>
            <div style={{ fontSize: 12, color: "var(--clg-navy)", fontWeight: 600, marginBottom: 8 }}>
              Recent history on {data.unitInfo.number}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9, fontSize: 12, color: "var(--clg-pewter)" }}>
              {history.map((h) => (
                <div key={h.id} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <span>{h.category} · {h.complaint || h.description || "—"}</span>
                  <span style={{ flexShrink: 0, textAlign: "right" }}>
                    <span style={{ color: "var(--clg-cool)", fontFamily: "var(--clg-font-mono)", fontSize: 11 }}>
                      {h.date_opened}{h.date_closed ? ` → ${h.date_closed}` : ""}
                    </span>
                    {" "}
                    <span style={{ color: h.status === "Closed" ? "var(--clg-cool)" : "var(--clg-ruby)" }}>{h.status}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ width: 320, flexShrink: 0 }}>
        <UnitInfoCard unit={data.unitInfo} />
      </div>
    </div>
  );
}
