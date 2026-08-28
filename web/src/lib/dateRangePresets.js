function toISO(d) {
  return d.toISOString().slice(0, 10);
}

export function thisMonthRange() {
  const t = new Date();
  return { start: toISO(new Date(t.getFullYear(), t.getMonth(), 1)), end: toISO(t) };
}
