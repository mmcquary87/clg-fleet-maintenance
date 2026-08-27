import { useState } from "react";
import { X, Loader2, Paperclip } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { CATEGORIES } from "../lib/categories";

const STATUSES = ["Open", "In Progress", "Closed"];

async function findOrCreateUnit(number) {
  const trimmed = number.trim();
  const { data: existing } = await supabase
    .from("units").select("id").ilike("number", trimmed).maybeSingle();
  if (existing) return existing.id;
  const { data: created, error } = await supabase
    .from("units").insert({ number: trimmed, type: "Truck" }).select("id").single();
  if (error) throw error;
  return created.id;
}

async function findOrCreateVendor(name, category) {
  const trimmed = name.trim();
  const { data: existing } = await supabase
    .from("vendors").select("id").ilike("name", trimmed).maybeSingle();
  if (existing) return existing.id;
  const { data: created, error } = await supabase
    .from("vendors").insert({ name: trimmed, specialty_category: category }).select("id").single();
  if (error) throw error;
  return created.id;
}

async function uploadReceipt(file) {
  const path = `${crypto.randomUUID()}-${file.name}`;
  const { error } = await supabase.storage.from("invoices").upload(path, file);
  if (error) throw error;
  return path;
}

export default function NewWorkOrderForm({ onSaved, onCancel }) {
  const [f, setF] = useState({
    unitNumber: "", vendorName: "", category: CATEGORIES[0], cost: "",
    status: "Closed", dateOpened: new Date().toISOString().slice(0, 10),
    dateClosed: new Date().toISOString().slice(0, 10), invoiceRef: "", description: "",
  });
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const unitId = await findOrCreateUnit(f.unitNumber);
      const vendorId = await findOrCreateVendor(f.vendorName, f.category);
      const receiptPath = file ? await uploadReceipt(file) : null;

      const { error: insertErr } = await supabase.from("work_orders").insert({
        unit_id: unitId,
        vendor_id: vendorId,
        category: f.category,
        cost: Number(f.cost) || 0,
        status: f.status,
        date_opened: f.dateOpened,
        date_closed: f.dateClosed || null,
        invoice_ref: f.invoiceRef || null,
        description: f.description || null,
        source: "manual",
        receipt_path: receiptPath,
      });
      if (insertErr) throw insertErr;

      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="detail" style={{ marginBottom: 20 }}>
      <div className="detail-head">
        <div className="detail-title" style={{ fontSize: 16 }}>New work order</div>
        <button className="refresh-btn" onClick={onCancel} type="button"><X size={14} /></button>
      </div>

      {error && <div className="banner warn" style={{ marginTop: 10 }}><div className="banner-body">{error}</div></div>}

      <form className="wo-form" onSubmit={onSubmit}>
        <label className="field">
          <span>Unit number</span>
          <input required value={f.unitNumber} onChange={set("unitNumber")} placeholder="e.g. 3419" />
        </label>
        <label className="field">
          <span>Category</span>
          <select value={f.category} onChange={set("category")}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Vendor</span>
          <input required value={f.vendorName} onChange={set("vendorName")} placeholder="e.g. Speedco — Brunswick, GA" />
        </label>
        <label className="field">
          <span>Cost ($)</span>
          <input required type="number" min="0" step="0.01" value={f.cost} onChange={set("cost")} placeholder="0.00" />
        </label>
        <label className="field">
          <span>Status</span>
          <select value={f.status} onChange={set("status")}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Invoice / ref #</span>
          <input value={f.invoiceRef} onChange={set("invoiceRef")} placeholder="Invoice #, PO #, or note" />
        </label>
        <label className="field">
          <span>Date opened</span>
          <input type="date" value={f.dateOpened} onChange={set("dateOpened")} />
        </label>
        <label className="field">
          <span>Date closed</span>
          <input type="date" value={f.dateClosed} onChange={set("dateClosed")} />
        </label>
        <label className="field" style={{ gridColumn: "1 / -1" }}>
          <span>Description</span>
          <textarea rows={2} value={f.description} onChange={set("description")} placeholder="What was done" />
        </label>
        <label className="field" style={{ gridColumn: "1 / -1" }}>
          <span>Receipt / invoice file (optional)</span>
          <div className="file-input">
            <Paperclip size={14} />
            <input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files[0] ?? null)} />
          </div>
        </label>

        <div className="wo-form-actions">
          <button type="button" className="toggle-btn" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? <Loader2 size={15} className="spin" /> : null}
            Save work order
          </button>
        </div>
      </form>
    </div>
  );
}
