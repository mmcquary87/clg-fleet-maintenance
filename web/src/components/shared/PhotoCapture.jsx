import { useRef } from "react";
import { Camera, Upload, X } from "lucide-react";
import { Button } from "../../ds";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// Multi-photo picker: "Take photo" opens the device camera directly (the
// `capture` attribute on a file input does this on mobile browsers),
// "Upload file" opens the normal file/library picker -- both land in the
// same thumbnail grid. Photos stay as local File objects (with an object
// URL for the thumbnail) until the parent form saves and uploads them.
export default function PhotoCapture({ photos, onChange, label }) {
  const cameraRef = useRef(null);
  const fileRef = useRef(null);

  const addFiles = (fileList) => {
    const added = Array.from(fileList || []).map((file) => ({ id: uid(), file, previewUrl: URL.createObjectURL(file) }));
    if (added.length > 0) onChange([...photos, ...added]);
  };

  const remove = (id) => onChange(photos.filter((p) => p.id !== id));

  return (
    <div>
      {label && <div style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginBottom: 8 }}>{label}</div>}
      <div style={{ display: "flex", gap: 8, marginBottom: photos.length > 0 ? 10 : 0 }}>
        <Button type="button" variant="outline" size="sm" iconLeft={<Camera size={13} />} onClick={() => cameraRef.current?.click()}>
          Take photo
        </Button>
        <Button type="button" variant="outline" size="sm" iconLeft={<Upload size={13} />} onClick={() => fileRef.current?.click()}>
          Upload file
        </Button>
        <input
          ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
          onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
        />
        <input
          ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }}
          onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
        />
      </div>
      {photos.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {photos.map((p) => (
            <div key={p.id} style={{ position: "relative", width: 72, height: 72 }}>
              <img
                src={p.previewUrl} alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "var(--clg-radius-sm)", border: "1px solid var(--clg-border-subtle)" }}
              />
              <button
                type="button" onClick={() => remove(p.id)} title="Remove"
                style={{
                  position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%",
                  background: "var(--clg-scarlet)", color: "#fff", border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
                }}
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
