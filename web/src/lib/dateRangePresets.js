function toISO(d) {
  return d.toISOString().slice(0, 10);
}

export function thisMonthRange() {
  const t = new Date();
  return { start: toISO(new Date(t.getFullYear(), t.getMonth(), 1)), end: toISO(t) };
}

// Full calendar month containing `date` -- first day through last day
// inclusive, not "month to date." Day 0 of the following month is the
// last day of this one.
export function monthRangeFor(date) {
  return {
    start: toISO(new Date(date.getFullYear(), date.getMonth(), 1)),
    end: toISO(new Date(date.getFullYear(), date.getMonth() + 1, 0)),
  };
}
