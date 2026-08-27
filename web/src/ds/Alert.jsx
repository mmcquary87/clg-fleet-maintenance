import { Info, AlertTriangle, Check, X } from "lucide-react";

const TONES = {
  info: { bar: "var(--clg-royal)", bg: "var(--clg-surface-sunken)", Icon: Info },
  critical: { bar: "var(--clg-ruby)", bg: "#FBEAEB", Icon: AlertTriangle },
  success: { bar: "var(--clg-royal)", bg: "var(--clg-surface-subtle)", Icon: Check },
};

/** Inline message. Scarlet/Ruby for problems, Royal for information. */
export default function Alert({ tone = "info", title, children, onDismiss, style, ...rest }) {
  const t = TONES[tone] || TONES.info;
  const Icon = t.Icon;
  return (
    <div role="status" style={{ display: "flex", gap: 12, background: t.bg, borderTop: "4px solid " + t.bar, padding: "14px 16px", ...style }} {...rest}>
      <Icon size={20} color={t.bar} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        {title && <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 15, color: "var(--clg-text-heading)", marginBottom: 2 }}>{title}</div>}
        <div style={{ fontSize: "var(--clg-size-small)", color: "var(--clg-text-body)" }}>{children}</div>
      </div>
      {onDismiss && (
        <button aria-label="Dismiss" onClick={onDismiss} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--clg-text-muted)", padding: 0 }}>
          <X size={18} />
        </button>
      )}
    </div>
  );
}
