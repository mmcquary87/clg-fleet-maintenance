import { useRef, useState } from "react";
import { UploadCloud, FileText, X } from "lucide-react";

/** Drag-and-drop file picker with a click-to-browse fallback. */
export default function FileDropzone({ file, onFileChange, accept = "image/*,application/pdf", label }) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const acceptFile = (f) => {
    if (f) onFileChange(f);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        acceptFile(e.dataTransfer.files?.[0] ?? null);
      }}
      onClick={() => inputRef.current?.click()}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 6, padding: "20px 16px", cursor: "pointer", textAlign: "center",
        border: `1.5px dashed ${dragOver ? "var(--clg-royal)" : "var(--clg-border-default)"}`,
        borderRadius: "var(--clg-radius-md)",
        background: dragOver ? "var(--clg-surface-subtle)" : "var(--clg-surface-card)",
        transition: "border-color .12s, background .12s",
      }}
    >
      <input
        ref={inputRef} type="file" accept={accept} style={{ display: "none" }}
        onChange={(e) => acceptFile(e.target.files?.[0] ?? null)}
      />
      {file ? (
        <>
          <FileText size={20} color="var(--clg-royal)" />
          <div style={{ fontSize: 12.5, color: "var(--clg-text-body)", fontWeight: 600 }}>{file.name}</div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onFileChange(null); }}
            style={{
              marginTop: 2, display: "flex", alignItems: "center", gap: 4, background: "none", border: "none",
              cursor: "pointer", fontSize: 11, color: "var(--clg-text-muted)",
            }}
          >
            <X size={11} /> Remove
          </button>
        </>
      ) : (
        <>
          <UploadCloud size={20} color="var(--clg-cool)" />
          <div style={{ fontSize: 12.5, color: "var(--clg-text-body)" }}>
            {label || "Drag & drop a file, or click to browse"}
          </div>
          <div style={{ fontSize: 10.5, color: "var(--clg-text-muted)" }}>Image or PDF</div>
        </>
      )}
    </div>
  );
}
