// Builds a mailto: URL that opens a prefilled draft in the user's own mail
// client (Outlook, if that's the OS/browser default) — the user reviews and
// sends it themselves. No email service or API key involved.
export function buildMailto({ to, subject, body }) {
  const params = [];
  if (subject) params.push(`subject=${encodeURIComponent(subject)}`);
  if (body) params.push(`body=${encodeURIComponent(body)}`);
  const query = params.length ? `?${params.join("&")}` : "";
  return `mailto:${(to || "").trim()}${query}`;
}
