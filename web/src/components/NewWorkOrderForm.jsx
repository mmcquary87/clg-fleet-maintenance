import { useState } from "react";
import { X, Loader2, Plus, Trash2, Sparkles } from "lucide-react";
import { Card, Field, Input, Select, Button, Alert, Eyebrow } from "../ds";
import { supabase } from "../lib/supabaseClient";
import { CATEGORIES } from "../lib/categories";
import FileDropzone from "./shared/FileDropzone";

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

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]); // strip the data: URL prefix
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
  const [scanning, setScanning] = useState(false);
  const [scanApplied, setScanApplied] = useState(false);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const onScan = async () => {
    if (!file) return;
    setScanning(true);
    setError(null);
    try {
      const fileBase64 = await fileToBase64(file);
      const { data, error: fnError } = await supabase.functions.invoke("scan-invoice", {
        body: { fileBase64, mediaType: file.type },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      setF((prev) => ({
        ...prev,
        vendorName: data.vendor || prev.vendorName,
        unitNumber: data.unitNumberGuess || prev.unitNumber,
        invoiceRef: data.invoiceRef || prev.invoiceRef,
        dateOpened: data.date || prev.dateOpened,
        dateClosed: data.date || prev.dateClosed,
      }));
      setLineItems((prev) => {
        const [first, ...rest] = prev;
        return [{ ...first, category: data.category, description: data.description, cost: data.cost }, ...rest];
      });
      setScanApplied(true);
    } catch (err) {
      setError(`AI scan failed: ${err.message}. You can still fill this out manually.`);
    } finally {
      setScanning(false);
    }
  };

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
    <Card style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
        <div>
          <Eyebrow tone="brand">Log Invoice</Eyebrow>
          <h2 style={{ fontSize: "var(--clg-size-h4)", fontWeight: 700, marginTop: 4 }}>Log a completed repair</h2>
        </div>
        <button type="button" onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clg-text-muted)" }}>
          <X size={18} />
        </button>
      </div>
      <p style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginTop: 4, marginBottom: 20 }}>
        For a repair that's already done, with a real invoice in hand — one shop visit, every service performed, each with its own category and cost.
      </p>

      {error && <Alert tone="critical" style={{ marginBottom: 16 }}>{error}</Alert>}

      <form onSubmit={onSubmit}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
          <Field label="Unit number" required>
            <Input required value={f.unitNumber} onChange={set("unitNumber")} placeholder="e.g. 3419" />
          </Field>
          <Field label="Vendor" required>
            <Input required value={f.vendorName} onChange={set("vendorName")} placeholder="e.g. Speedco — Brunswick, GA" />
          </Field>
          <Field label="Status">
            <Select value={f.status} onChange={set("status")} options={STATUSES} />
          </Field>
          <Field label="Invoice / ref #">
            <Input value={f.invoiceRef} onChange={set("invoiceRef")} placeholder="Invoice #, PO #, or note" />
          </Field>
          <Field label="Date opened">
            <Input type="date" value={f.dateOpened} onChange={set("dateOpened")} />
          </Field>
          <Field label="Date closed">
            <Input type="date" value={f.dateClosed} onChange={set("dateClosed")} />
          </Field>
          <Field label="Receipt / invoice file" help="Optional, shared across all services below" style={{ gridColumn: "1 / -1" }}>
            <FileDropzone
              file={file}
              onFileChange={(newFile) => { setFile(newFile); setScanApplied(false); }}
              label="Drag & drop the invoice here, or click to browse"
            />
            {file && (
              <Button type="button" variant="secondary" size="sm" onClick={onScan} disabled={scanning}
                iconLeft={scanning ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />}
                style={{ marginTop: 10, alignSelf: "flex-start" }}
              >
                {scanning ? "Scanning…" : "Scan with AI"}
              </Button>
            )}
            {scanApplied && (
              <div style={{ fontSize: 11.5, color: "var(--clg-royal)", marginTop: 6, fontWeight: 600 }}>
                AI filled in the fields below from this file — review and correct anything before saving.
              </div>
            )}
          </Field>
        </div>

        <div style={{ borderTop: "1px solid var(--clg-border-subtle)", paddingTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
            <span style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--clg-text-heading)" }}>
              Services performed
            </span>
            <span style={{ fontFamily: "var(--clg-font-mono, monospace)", fontSize: 15, color: "var(--clg-navy)", fontWeight: 700 }}>
              ${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })} total
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {lineItems.map((li) => (
              <div key={li.id} style={{ display: "grid", gridTemplateColumns: "150px 1fr 110px auto", gap: 8, alignItems: "center" }}>
                <Select value={li.category} onChange={setLineItem(li.id, "category")} options={CATEGORIES} />
                <Input value={li.description} onChange={setLineItem(li.id, "description")} placeholder="What was done — e.g. Turbo replacement" />
                <Input
                  required type="number" min="0" step="0.01"
                  value={li.cost} onChange={setLineItem(li.id, "cost")} placeholder="0.00"
                  style={{ fontFamily: "var(--clg-font-mono, monospace)" }}
                />
                <button
                  type="button" onClick={() => removeLineItem(li.id)} disabled={lineItems.length === 1}
                  title="Remove this service"
                  style={{
                    background: "none", border: "none", cursor: lineItems.length === 1 ? "not-allowed" : "pointer",
                    color: "var(--clg-text-muted)", opacity: lineItems.length === 1 ? 0.35 : 1, padding: 6, display: "inline-flex",
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          <Button type="button" variant="quiet" size="sm" iconLeft={<Plus size={14} />} onClick={addLineItem} style={{ marginTop: 10 }}>
            Add another service
          </Button>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          <Button type="submit" size="sm" disabled={submitting} iconLeft={submitting ? <Loader2 size={14} className="spin" /> : null}>
            Save{lineItems.length > 1 ? ` (${lineItems.length} services)` : ""}
          </Button>
        </div>
      </form>
    </Card>
  );
}
