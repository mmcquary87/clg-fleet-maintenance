// Single source of truth for the Driver Accountability enums -- must stay in
// sync with the Postgres enum definitions (accountability_coaching_stage,
// accountability_appeal_status, accountability_training_platform in
// 20261007060000_driver_accountability.sql / 20261014010000_driver_incident_training_platform.sql,
// accountability_severity in 20261007060000_driver_accountability.sql).
// Previously hand-duplicated as separate hardcoded arrays in
// LogIncidentForm.jsx and useDriverIncidents.js -- same drift risk as
// wo_category/categories.js, now collapsed to one file.

export const COACHING_STAGES = [
  "First Infraction",
  "Second Infraction",
  "Third Infraction",
  "Driver Being Fined",
  "Final Warning",
  "Termination",
];

export const APPEAL_STATUSES = ["Not Submitted", "Pending", "Approved", "Denied"];

export const TRAINING_PLATFORMS = ["CarriersEdge", "Samsara", "TenStreet"];

export const SEVERITIES = ["Minor", "Moderate", "Heavy", "Severe"];
