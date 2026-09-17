// Splits a work order's flat cost across categories when its logged parts
// carry a category different from the work order's own -- e.g. a turbo
// replacement logged on a "General Repair" job should count as Engine
// spend there, not General Repair (see supabase/migrations/
// 20260918080000_work_order_parts_category.sql for why the column
// exists). Parts costs (quantity * unitCost) are attributed to each
// part's own category, falling back to the work order's category when a
// part has none logged; if parts add up to more than the work order's
// actual invoiced cost, they're scaled down proportionally rather than
// over-counting. Whatever's left over (labor, markup, parts with no cost
// logged) stays under the work order's own category -- the split always
// sums back to exactly the original cost, never inventing or losing money.
export function splitCostByCategory(record) {
  const parts = (record.parts ?? []).filter((p) => p.unitCost != null);
  if (parts.length === 0) return [{ category: record.category, amount: record.cost }];

  const partsCostByCategory = new Map();
  let totalPartsCost = 0;
  for (const p of parts) {
    const cat = p.category || record.category;
    const amount = p.quantity * p.unitCost;
    totalPartsCost += amount;
    partsCostByCategory.set(cat, (partsCostByCategory.get(cat) || 0) + amount);
  }
  if (totalPartsCost <= 0) return [{ category: record.category, amount: record.cost }];

  const scale = totalPartsCost > record.cost ? record.cost / totalPartsCost : 1;
  const rows = [...partsCostByCategory.entries()].map(([category, amount]) => ({
    category,
    amount: amount * scale,
  }));
  const allocated = rows.reduce((s, r) => s + r.amount, 0);
  const remainder = record.cost - allocated;
  if (remainder > 0.005) {
    const existing = rows.find((r) => r.category === record.category);
    if (existing) existing.amount += remainder;
    else rows.push({ category: record.category, amount: remainder });
  }
  return rows;
}

// Category rollup across many work-order records, splitting each one's
// cost per splitCostByCategory above -- same {name, value} shape as
// groupSum(records, "category") so it drops into the Spend-by-category
// chart in place of it without touching anything else that reads
// `records` (filtering, CSV export, per-unit top-category badges, etc.
// all keep using each work order's own single category).
export function groupSumByPartCategory(records) {
  const m = {};
  records.forEach((r) => {
    splitCostByCategory(r).forEach(({ category, amount }) => {
      m[category] = (m[category] || 0) + amount;
    });
  });
  return Object.entries(m)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}
