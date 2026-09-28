import { useState } from "react";
import { Copy, RotateCcw, Send, Check } from "lucide-react";
import { Button, Alert } from "../../ds";
import { useAuth } from "../../hooks/useAuth";
import { useProfile } from "../../hooks/useProfile";
import { supabase } from "../../lib/supabaseClient";
import { draftEmail, draftSms } from "../../lib/outreachTemplates";

function buildDraft(channel, lead, recruiterName) {
  if (channel === "email") {
    const { subject, body } = draftEmail(lead, recruiterName);
    return "Subject: " + subject + "\n\n" + body;
  }
  return draftSms(lead, recruiterName);
}

export default function OutreachDraftPanel({ lead, onLogged }) {
  const { session } = useAuth();
  const { profile } = useProfile(session?.user?.id);
  const recruiterName = profile?.full_name || session?.user?.email || "CLG Recruiting";

  const defaultChannel = lead.email ? "email" : "sms";
  const [channel, setChannel] = useState(defaultChannel);
  const [text, setText] = useState(() => buildDraft(defaultChannel, lead, recruiterName));
  const [copied, setCopied] = useState(false);
  const [logging, setLogging] = useState(false);
  const [logged, setLogged] = useState(false);
  const [error, setError] = useState(null);

  const canEmail = !!lead.email;
  const canSms = !!lead.phone;

  const switchChannel = (next) => {
    setChannel(next);
    setText(buildDraft(next, lead, recruiterName));
    setLogged(false);
  };

  const regenerate = () => setText(buildDraft(channel, lead, recruiterName));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API unavailable (e.g. insecure context) -- the text is
      // still selectable in the textarea, so this is a soft failure.
    }
  };

  const markSent = async () => {
    setLogging(true);
    setError(null);
    const { error: err } = await supabase.from("lead_conversations").insert({
      lead_id: lead.id,
      channel,
      direction: "outbound",
      author: session?.user?.email || "unknown",
      summary: "Outreach sent (" + channel + ")",
      body: text,
    });
    setLogging(false);
    if (err) { setError(err.message); return; }
    setLogged(true);
    onLogged?.();
  };

  if (!canEmail && !canSms) {
    return <div style={{ fontSize: 13, color: "var(--clg-text-muted)" }}>No phone or email on file for this lead yet.</div>;
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        {canEmail && (
          <button type="button" onClick={() => switchChannel("email")} style={{
            padding: "6px 12px", borderRadius: "var(--clg-radius-pill)", border: "1px solid " + (channel === "email" ? "var(--clg-royal)" : "var(--clg-border-default)"),
            background: channel === "email" ? "var(--clg-royal)" : "transparent", color: channel === "email" ? "#fff" : "var(--clg-text-body)", fontSize: 12.5, cursor: "pointer",
          }}>Email</button>
        )}
        {canSms && (
          <button type="button" onClick={() => switchChannel("sms")} style={{
            padding: "6px 12px", borderRadius: "var(--clg-radius-pill)", border: "1px solid " + (channel === "sms" ? "var(--clg-royal)" : "var(--clg-border-default)"),
            background: channel === "sms" ? "var(--clg-royal)" : "transparent", color: channel === "sms" ? "#fff" : "var(--clg-text-body)", fontSize: 12.5, cursor: "pointer",
          }}>SMS</button>
        )}
      </div>

      <textarea
        value={text} onChange={(e) => { setText(e.target.value); setLogged(false); }} rows={channel === "email" ? 9 : 3}
        style={{
          width: "100%", boxSizing: "border-box", fontFamily: "var(--clg-font-body)", fontSize: 13,
          color: "var(--clg-text-body)", background: "var(--clg-surface-page)", border: "1px solid var(--clg-border-default)",
          borderRadius: "var(--clg-radius-sm)", padding: "10px 12px", resize: "vertical",
        }}
      />

      {error && <Alert tone="critical" style={{ marginTop: 10 }}>{error}</Alert>}
      {logged && <div style={{ fontSize: 12, color: "var(--clg-text-muted)", marginTop: 8 }}>Logged to this lead's activity.</div>}

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <Button variant="outline" size="sm" iconLeft={<RotateCcw size={12} />} onClick={regenerate}>Regenerate</Button>
        <Button variant="outline" size="sm" iconLeft={copied ? <Check size={12} /> : <Copy size={12} />} onClick={copy}>{copied ? "Copied" : "Copy"}</Button>
        <Button size="sm" iconLeft={<Send size={12} />} disabled={logging} onClick={markSent}>Mark as sent</Button>
      </div>
      <div style={{ fontSize: 11, color: "var(--clg-text-muted)", marginTop: 8 }}>
        This is a draft only — nothing is sent automatically. Copy it into your own email/SMS and send it yourself,
        then use "Mark as sent" to log it here.
      </div>
    </div>
  );
}
