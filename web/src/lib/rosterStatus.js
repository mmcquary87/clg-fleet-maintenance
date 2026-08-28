// Mirrors the governed Excel roster's live formulas exactly (Roster!H:I),
// layering Eligibility on top per the Instructions tab: "Not Eligible"
// is a hard block independent of any leave dates.

export const ELIGIBILITY_OPTIONS = ["Eligible", "Not Eligible"];
export const UNAVAILABLE_REASONS = ["Vacation", "Personal Leave", "Sick", "Medical/Injury", "Suspension", "Terminated", "Other"];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Roster!H4: =IF(OR(D4="",E4=""),"",IF(AND(TODAY()>=D4,TODAY()<=E4),"Yes",IF(D4>TODAY(),"Upcoming","No")))
function currentlyUnavailable(startDate, endDate) {
  if (!startDate || !endDate) return "";
  const today = todayStr();
  if (today >= startDate && today <= endDate) return "Yes";
  return startDate > today ? "Upcoming" : "No";
}

// Roster!I4: =IF(E4="","",IF(E4<TODAY(),"Ended",IF(D4>TODAY(),D4-TODAY(),E4-TODAY())))
export function daysRemaining(startDate, endDate) {
  if (!endDate) return null;
  const today = todayStr();
  if (endDate < today) return "Ended";
  const target = startDate > today ? startDate : endDate;
  const days = Math.round((new Date(target) - new Date(today)) / 86400000);
  return days;
}

// "Available" | "Upcoming" | "Unavailable" | "Not Eligible"
export function rosterStatus(row) {
  if (row.eligibility === "Not Eligible") return "Not Eligible";
  const flag = currentlyUnavailable(row.start_date, row.end_date);
  if (flag === "Yes") return "Unavailable";
  if (flag === "Upcoming") return "Upcoming";
  return "Available";
}

export function statusTone(status) {
  if (status === "Not Eligible") return "critical";
  if (status === "Unavailable") return "critical";
  if (status === "Upcoming") return "accent";
  return "brand";
}
