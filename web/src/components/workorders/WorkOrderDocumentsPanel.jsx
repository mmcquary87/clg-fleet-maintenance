import { useState } from "react";
import { Loader2, FileText, Trash2, Download } from "lucide-react";
import { Button, Input } from "../../ds";
import { useWorkOrderDocuments } from "../../hooks/useWorkOrderDocuments";
import FileDropzone from "../shared/FileDropzone";

// Replaces the old single receipt_path column/attach-one-invoice toggle
// with a real list -- see 20260918130000_work_order_documents.sql for
// why (a work order legitimately needs more than one attached PDF: the
// original invoice, a warranty doc, a follow-up repair receipt, etc).
export default function WorkOrderDocumentsPanel({ workOrderId }) {
  const { documents, loading, error, upload, remove, signedUrlFor } = useWorkOrderDocuments(workOrderId);
  const [file, setFile] = useState(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [openingId, setOpeningId] = useState(null);

  const handleUpload = async () => {
    if (!file) return;
    setSaving(true);
    setSaveError(null);
    const err = await upload({ file, note });
    if (err) setSaveError(err.message || "Upload failed.");
    else { setFile(null); setNote(""); }
    setSaving(false);
  };

  const handleOpen = async (doc) => {
    setOpeningId(doc.id);
    const url = await signedUrlFor(doc);
    setOpeningId(null);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div>
      <div style={{ fontSize: 10.5, color: "var(--clg-text-muted)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
        Receipts / invoices
      </div>

      {error && <div style={{ fontSize: 12, color: "var(--clg-scarlet)", marginBottom: 10 }}>{error}</div>}

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 12, color: "var(--clg-text-muted)" }}>
          <Loader2 size={16} className="spin" />
        </div>
      ) : documents.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--clg-text-muted)", marginBottom: 10 }}>No documents attached yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
          {documents.map((doc) => (
            <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid var(--clg-border-subtle)", borderRadius: "var(--clg-radius-md)", padding: "8px 10px" }}>
              <FileText size={15} color="var(--clg-royal)" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.file_name}</div>
                <div style={{ fontSize: 11, color: "var(--clg-text-muted)" }}>
                  {new Date(doc.created_at).toLocaleDateString()}{doc.note ? ` · ${doc.note}` : ""}
                </div>
              </div>
              <button
                onClick={() => handleOpen(doc)} title="View"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clg-royal)", display: "flex" }}
              >
                {openingId === doc.id ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
              </button>
              <button
                onClick={() => remove(doc)} title="Delete"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clg-text-muted)", display: "flex" }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <FileDropzone file={file} onFileChange={setFile} accept="application/pdf,image/*" label="Drag & drop a receipt/PDF here to attach it" />
      {file && (
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <Input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} style={{ flex: 1 }} />
          <Button size="sm" onClick={handleUpload} disabled={saving}>
            {saving ? <Loader2 size={13} className="spin" /> : "Attach"}
          </Button>
        </div>
      )}
      {saveError && <div style={{ color: "var(--clg-scarlet)", fontSize: 12, marginTop: 6 }}>{saveError}</div>}
    </div>
  );
}
