// Growth Roadmap's "Fix this week" callout: CDL and medical-card
// expiration dates are synced from Alvys but never surfaced anywhere.
// Thresholds chosen for real lead time to renew, not just a flat cutoff --
// a critical window inside 2 weeks needs to be dispatched/scheduled now,
// while 60 days is enough runway to just plan around.
const WARNING_DAYS = 60;
const CRITICAL_DAYS = 14;

export function complianceStatus(expiresAt) {
  if (!expiresAt) return { status: "unknown", daysRemaining: null };
  const daysRemaining = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 86400000);
  if (daysRemaining < 0) return { status: "expired", daysRemaining };
  if (daysRemaining <= CRITICAL_DAYS) return { status: "critical", daysRemaining };
  if (daysRemaining <= WARNING_DAYS) return { status: "warning", daysRemaining };
  return { status: "ok", daysRemaining };
}

// Worse-of-two-dates rank, so a driver row sorts/badges by whichever
// credential is closer to lapsing -- a fine CDL doesn't hide an expired
// medical card, or vice versa.
const RANK = { expired: 0, critical: 1, warning: 2, unknown: 3, ok: 4 };

export function worstStatus(licenseStatus, medicalStatus) {
  return RANK[licenseStatus.status] <= RANK[medicalStatus.status] ? licenseStatus : medicalStatus;
}
