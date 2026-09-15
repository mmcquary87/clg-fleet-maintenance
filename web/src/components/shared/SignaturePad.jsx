import { useEffect, useRef } from "react";

// Canvas coordinates use the canvas's internal pixel size (the width/
// height attributes), not its CSS-rendered size -- scale the pointer
// position by that ratio so drawing stays under the cursor/finger
// regardless of how the canvas is stretched to fit its container.
function pointerPos(canvas, e) {
  const rect = canvas.getBoundingClientRect();
  const touch = e.touches?.[0];
  const clientX = touch ? touch.clientX : e.clientX;
  const clientY = touch ? touch.clientY : e.clientY;
  return {
    x: (clientX - rect.left) * (canvas.width / rect.width),
    y: (clientY - rect.top) * (canvas.height / rect.height),
  };
}

// A drawn signature, not a typed name -- plain canvas + pointer tracking,
// exported as a base64 PNG data URL on every stroke. No library needed
// for something this small.
export default function SignaturePad({ value, onChange, height = 120 }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const restored = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || restored.current) return;
    // Restore an already-signed value once (e.g. coming back to a saved draft).
    if (value) {
      const ctx = canvas.getContext("2d");
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0);
      img.src = value;
    }
    restored.current = true;
  }, [value]);

  const start = (e) => {
    e.preventDefault();
    drawing.current = true;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#12213D";
    const { x, y } = pointerPos(canvas, e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const { x, y } = pointerPos(canvas, e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(canvasRef.current.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    onChange(null);
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={460}
        height={height}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end}
        style={{
          width: "100%", height, touchAction: "none", cursor: "crosshair",
          border: "1px solid var(--clg-border-default)", borderRadius: "var(--clg-radius-sm)",
          background: "#fff", display: "block",
        }}
      />
      <button
        type="button" onClick={clear}
        style={{ marginTop: 4, background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "var(--clg-royal)" }}
      >
        Clear
      </button>
    </div>
  );
}
