export function groupSum(records, key) {
  const m = {};
  records.forEach((r) => {
    m[r[key]] = (m[r[key]] || 0) + r.cost;
  });
  return Object.entries(m)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

// Per-vendor rollup for the Spend-by-vendor leaderboard: spend, job count,
// average ticket, distinct units serviced, and share of total fleet spend.
export function groupVendorStats(records) {
  const m = {};
  records.forEach((r) => {
    const v = m[r.vendor] || { name: r.vendor, spend: 0, jobs: 0, units: new Set() };
    v.spend += r.cost;
    v.jobs += 1;
    v.units.add(r.unit);
    m[r.vendor] = v;
  });
  const total = records.reduce((s, r) => s + r.cost, 0);
  return Object.values(m)
    .map((v) => ({
      name: v.name,
      spend: v.spend,
      jobs: v.jobs,
      avgTicket: v.jobs > 0 ? v.spend / v.jobs : 0,
      units: v.units.size,
      pctFleet: total > 0 ? (v.spend / total) * 100 : 0,
    }))
    .sort((a, b) => b.spend - a.spend);
}
