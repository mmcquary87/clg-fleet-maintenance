import { useState } from "react";
import { X, Loader2, Paperclip, Plus, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { CATEGORIES } from "../lib/categories";

const STATUSES = ["Open", "In Progress", "Closed"];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function emptyLineItem() {
  return { id: uid(), category: CATEGORIES[0], description: "", cost: "" };
}

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
    unitNumber: "", vendorName: "",
    status: "Closed", dateOpened: new Date().toISOString().slice(0, 10),
    dateClosed: new Date().toISOString().slice(0, 10), invoiceRef: "",
  });
  const [lineItems, setLineItems] = useState([emptyLineItem()]);
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const setLineItem = (id, k) => (e) => {
    setLineItems(lineItems.map((li) => (li.id === id ? { ...li, [k]: e.target.value } : li)));
  };
  const addLineItem = () => setLineItems([...lineItems, emptyLineItem()]);
  const removeLineItem = (id) => setLineItems(lineItems.filter((li) => li.id !== id));

  const totalCost = lineItems.reduce((s, li) => s + (Number(li.cost) || 0), 0);

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const unitId = await findOrCreateUnit(f.unitNumber);
      const vendorId = await findOrCreateVendor(f.vendorName, lineItems[0].category);
      const receiptPath = file ? await uploadReceipt(file) : null;

      const rows = lineItems.map((li) => ({
        unit_id: unitId,
        vendor_id: vendorId,
        category: li.category,
        cost: Number(li.cost) || 0,
        status: f.status,
        date_opened: f.dateOpened,
        date_closed: f.dateClosed || null,
        invoice_ref: f.invoiceRef || null,
        description: li.description || null,
        source: "manual",
        receipt_path: receiptPath,
      }));

      const { error: insertErr } = await supabase.from("work_orders").insert(rows);
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
      <div className="detail-sub">One shop visit — add every service performed, each with its own category and cost.</div>

      {error && <div className="banner warn" style={{ marginTop: 10 }}><div className="banner-body">{error}</div></div>}

      <form onSubmit={onSubmit}>
        <div className="wo-form">
          <label className="field">
            <span>Unit number</span>
            <input required value={f.unitNumber} onChange={set("unitNumber")} placeholder="e.g. 3419" />
          </label>
          <label className="field">
            <span>Vendor</span>
            <input required value={f.vendorName} onChange={set("vendorName")} placeholder="e.g. Speedco — Brunswick, GA" />
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
            <span>Receipt / invoice file (optional, shared across all services below)</span>
            <div className="file-input">
              <Paperclip size={14} />
              <input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files[0] ?? null)} />
            </div>
          </label>
        </div>

        <div className="line-items">
          <div className="line-items-head">
            <span>Services performed</span>
            <span className="line-items-total">${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })} total</span>
          </div>

          {lineItems.map((li, i) => (
            <div className="line-item" key={li.id}>
              <select value={li.category} onChange={setLineItem(li.id, "category")}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <input
                className="line-item-desc"
                value={li.description}
                onChange={setLineItem(li.id, "description")}
                placeholder="What was done — e.g. Turbo replacement"
              />
              <input
                required type="number" min="0" step="0.01"
                className="line-item-cost"
                value={li.cost}
                onChange={setLineItem(li.id, "cost")}
                placeholder="0.00"
              />
              <button
                type="button" className="icon-btn-del" onClick={() => removeLineItem(li.id)}
                disabled={lineItems.length === 1} title="Remove this service"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}

          <button type="button" className="toggle-btn" onClick={addLineItem}>
            <Plus size={14} /> Add another service
          </button>
        </div>

        <div className="wo-form-actions">
          <button type="button" className="toggle-btn" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? <Loader2 size={15} className="spin" /> : null}
            Save work order{lineItems.length > 1 ? ` (${lineItems.length} services)` : ""}
          </button>
        </div>
      </form>
    </div>
  );
}
