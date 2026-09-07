import { useState } from "react";
import { Loader2, FileText, Trash2, Download } from "lucide-react";
import { Button, Select, Input, Badge } from "../../ds";
import { useUnitDocuments, UNIT_DOC_TYPES } from "../../hooks/useUnitDocuments";
import FileDropzone from "../shared/FileDropzone";

function docTypeLabel(docType) {
  return UNIT_DOC_TYPES.find((t) => t.value === docType)?.label || docType;
}

export default function UnitDocumentsPanel({ unitId }) {
  const { documents, loading, error, upload, remove, signedUrlFor } = useUnitDocuments(unitId);
  const [file, setFile] = useState(null);
  const [docType, setDocType] = useState("photo");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [openingId, setOpeningId] = useState(null);

  const handleUpload = async () => {
    if (!file) return;
    setSaving(true);
    setSaveError(null);
    const err = await upload({ file, docType, note });
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
      <div style={{ border: "1px solid var(--clg-border-subtle)", borderRadius: "var(--clg-radius-md)", padding: 14, marginBottom: 16 }}>
        <div style={{ fontSize: 10.5, color: "var(--clg-text-muted)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>
          Add a document
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <FileDropzone file={file} onFileChange={setFile} accept="image/*,application/pdf" label="Drag & drop a photo or PDF, or click to browse" />
          <Select value={docType} onChange={(e) => setDocType(e.target.value)} options={UNIT_DOC_TYPES} />
          <Input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          {saveError && <div style={{ fontSize: 12, color: "var(--clg-scarlet)" }}>{saveError}</div>}
          <Button size="sm" onClick={handleUpload} disabled={!file || saving}>
            {saving ? <Loader2 size={13} className="spin" /> : "Upload"}
          </Button>
        </div>
      </div>

      {error && <div style={{ fontSize: 12, color: "var(--clg-scarlet)", marginBottom: 12 }}>{error}</div>}

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 20, color: "var(--clg-text-muted)" }}>
          <Loader2 size={16} className="spin" />
        </div>
      ) : documents.length === 0 ? (
        <div style={{ padding: "16px 0", textAlign: "center", color: "var(--clg-text-muted)", fontSize: 13 }}>
          No documents on file for this unit yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {documents.map((doc) => (
            <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid var(--clg-border-subtle)", borderRadius: "var(--clg-radius-md)", padding: "10px 12px" }}>
              <FileText size={16} color="var(--clg-royal)" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Badge tone="neutral">{docTypeLabel(doc.doc_type)}</Badge>
                  <span style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.file_name}</span>
                </div>
                <div style={{ fontSize: 11, color: "var(--clg-text-muted)", marginTop: 3 }}>
                  {new Date(doc.created_at).toLocaleDateString()}{doc.note ? ` · ${doc.note}` : ""}
                </div>
              </div>
              <button
                onClick={() => handleOpen(doc)} title="View"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clg-royal)", display: "flex" }}
              >
                {openingId === doc.id ? <Loader2 size={15} className="spin" /> : <Download size={15} />}
              </button>
              <button
                onClick={() => remove(doc)} title="Delete"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clg-text-muted)", display: "flex" }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
