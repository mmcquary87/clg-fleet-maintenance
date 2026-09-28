// Draft-only outreach message generation (RECRUITING.md section 8: "dry-run
// by default... The AI never negotiates, never invents terms"). These
// templates are pure text generation from the EXACT program terms in
// RECRUITING.md section 2 -- no LLM call, no external send, nothing that
// could vary the numbers a recruiter didn't already approve. A human
// reviews, edits, and sends every message themselves; this only saves them
// writing it from scratch.

const SEGMENT_OPENING = {
  new_mc: "an opportunity to lease onto CLG Transportation's authority and insurance",
  small_fleet: "CLG's brokerage carrier program",
  driver: "an opportunity to drive for CLG Transportation, including a path to owning your own truck",
};

const SEGMENT_TERMS = {
  new_mc: [
    "A Net Mileage Guarantee of at least $0.75 per mile net -- non-recoverable, so a slow week is never owed back.",
    "CLG's Love's and TA/Petro fuel discount program.",
    "QuickPay through Triumph available.",
  ],
  small_fleet: [
    "Consistent lanes.",
    "CLG's Love's and TA/Petro fuel discount program.",
    "QuickPay through Triumph available.",
  ],
  driver: [
    "A Net Mileage Guarantee of at least $0.75 per mile net -- non-recoverable, so a slow week is never owed back.",
    "If you don't have your own truck, CLG's lease-purchase program: weekly payments from settlements, building equity with every payment, on a new or newer truck leased onto CLG.",
    "CLG's Love's and TA/Petro fuel discount program.",
  ],
};

function contactFirstName(lead) {
  return (lead.contact_name || "").trim().split(/\s+/)[0] || null;
}

export function draftEmail(lead, recruiterName) {
  const first = contactFirstName(lead);
  const greeting = first ? "Hi " + first + "," : "Hi there,";
  const opening = SEGMENT_OPENING[lead.segment] || SEGMENT_OPENING.new_mc;
  const terms = (SEGMENT_TERMS[lead.segment] || SEGMENT_TERMS.new_mc).map((t) => "- " + t).join("\n");
  const subject = lead.segment === "small_fleet" ? "CLG Transportation — Carrier Partnership" : "CLG Transportation — Owner-Operator Opportunity";
  const body = greeting + "\n\n" +
    "I'm reaching out from CLG Transportation about " + opening + ".\n\n" +
    "A few details:\n" + terms + "\n\n" +
    "Would you be open to a quick call this week to go over specifics and see if it's a fit?\n\n" +
    "Thanks,\n" + (recruiterName || "CLG Recruiting") + "\n" +
    "CLG Transportation";
  return { subject, body };
}

export function draftSms(lead, recruiterName) {
  const first = contactFirstName(lead);
  const greeting = first ? "Hi " + first + "," : "Hi,";
  const shortOffer = lead.segment === "small_fleet"
    ? "consistent lanes, fuel discounts, and QuickPay"
    : "a $0.75/mi net mileage guarantee and fuel discounts";
  return greeting + " this is " + (recruiterName || "CLG Recruiting") + " with CLG Transportation. We have " + shortOffer + ". Interested in a quick call? Reply STOP to opt out.";
}
