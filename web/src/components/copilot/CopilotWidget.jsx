import { useEffect, useRef, useState } from "react";
import { Sparkles, X, ArrowUp, Loader2, RotateCcw } from "lucide-react";
import { useCopilot } from "../../hooks/useCopilot";

const SUGGESTIONS = [
  "Which trucks are idle right now, and what's it costing us?",
  "Any trucks about to go empty with no reload?",
  "Any units with a check-engine light we haven't acted on?",
  "How is Suburban Towing performing this year?",
  "What's unit 3307's status?",
  "What did we spend on maintenance this month?",
];

function Bubble({ role, content }) {
  const isUser = role === "user";
  return (
    <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}>
      <div style={{
        maxWidth: "85%", padding: "9px 13px", borderRadius: 12,
        borderBottomRightRadius: isUser ? 3 : 12, borderBottomLeftRadius: isUser ? 12 : 3,
        background: isUser ? "var(--clg-royal)" : "var(--clg-surface-subtle)",
        color: isUser ? "#fff" : "var(--clg-text-body)",
        fontSize: 13.5, lineHeight: 1.5, whiteSpace: "pre-wrap",
      }}>
        {content}
      </div>
    </div>
  );
}

export default function CopilotWidget() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const { messages, sending, error, ask, reset } = useCopilot();
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending, open]);

  const submit = (text) => {
    const q = (text ?? draft).trim();
    if (!q) return;
    setDraft("");
    ask(q);
  };

  return (
    <>
      {open && (
        <div style={{
          position: "fixed", bottom: 88, right: 24, width: 380, maxWidth: "calc(100vw - 32px)", height: 520,
          maxHeight: "calc(100vh - 120px)", background: "#fff", borderRadius: "var(--clg-radius-md)",
          boxShadow: "0 16px 48px rgba(34,59,98,.24)", border: "1px solid var(--clg-border-subtle, #DAE7F1)",
          display: "flex", flexDirection: "column", zIndex: 1000, overflow: "hidden",
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8, padding: "14px 16px",
            background: "var(--clg-navy)", color: "#fff", flexShrink: 0,
          }}>
            <Sparkles size={16} />
            <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 13.5, flex: 1 }}>
              Ops Copilot
            </div>
            {messages.length > 0 && (
              <button onClick={reset} title="New conversation" style={{ background: "none", border: "none", color: "rgba(255,255,255,.75)", cursor: "pointer", display: "flex" }}>
                <RotateCcw size={14} />
              </button>
            )}
            <button onClick={() => setOpen(false)} title="Close" style={{ background: "none", border: "none", color: "rgba(255,255,255,.75)", cursor: "pointer", display: "flex" }}>
              <X size={16} />
            </button>
          </div>

          <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            {messages.length === 0 ? (
              <div>
                <div style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginBottom: 10 }}>
                  Ask about idle trucks, reloads, vendor performance, spend, or a specific unit — I'll pull it from live data.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s} onClick={() => submit(s)}
                      style={{
                        textAlign: "left", padding: "8px 11px", fontSize: 12.5, color: "var(--clg-royal)",
                        background: "var(--clg-surface-subtle)", border: "none", borderRadius: 8, cursor: "pointer",
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => <Bubble key={i} role={m.role} content={m.content} />)
            )}
            {sending && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--clg-text-muted)", fontSize: 12.5 }}>
                <Loader2 size={13} className="spin" /> Checking…
              </div>
            )}
            {error && (
              <div style={{ color: "var(--clg-scarlet)", fontSize: 12.5 }}>{error}</div>
            )}
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); submit(); }}
            style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid var(--clg-border-subtle, #DAE7F1)", flexShrink: 0 }}
          >
            <input
              value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask a question…"
              disabled={sending}
              style={{
                flex: 1, border: "1px solid var(--clg-border-default, #A3BACB)", borderRadius: 8, padding: "9px 12px",
                fontSize: 13.5, fontFamily: "var(--clg-font-body)", outline: "none",
              }}
            />
            <button
              type="submit" disabled={sending || !draft.trim()}
              style={{
                width: 36, height: 36, borderRadius: 8, border: "none", flexShrink: 0,
                background: draft.trim() && !sending ? "var(--clg-royal)" : "var(--clg-moon)",
                color: "#fff", cursor: draft.trim() && !sending ? "pointer" : "default",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <ArrowUp size={16} />
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        title="Ops Copilot"
        style={{
          position: "fixed", bottom: 24, right: 24, width: 52, height: 52, borderRadius: "50%",
          background: "var(--clg-royal)", border: "none", cursor: "pointer", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 6px 20px rgba(17,85,161,.4)",
        }}
      >
        {open ? <X size={20} color="#fff" /> : <Sparkles size={20} color="#fff" />}
      </button>
    </>
  );
}
