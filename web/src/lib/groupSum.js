export function groupSum(records, key) {
  const m = {};
  records.forEach((r) => {
    m[r[key]] = (m[r[key]] || 0) + r.cost;
  });
  return Object.entries(m)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}
