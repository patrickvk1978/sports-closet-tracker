// ─── Bracket topology ──────────────────────────────────────────────────────────
// Maps each slot to its two feeder (child) slots.
// R64 slots have [null, null] (seed-in, no feeders).

export const BRACKET_TREE = (() => {
  const tree = {};
  for (const base of [0, 15, 30, 45]) {
    for (let i = 0; i < 8; i += 1) tree[base + i] = [null, null];
    tree[base + 8] = [base + 0, base + 1];
    tree[base + 9] = [base + 2, base + 3];
    tree[base + 10] = [base + 4, base + 5];
    tree[base + 11] = [base + 6, base + 7];
    tree[base + 12] = [base + 8, base + 9];
    tree[base + 13] = [base + 10, base + 11];
    tree[base + 14] = [base + 12, base + 13];
  }
  tree[60] = [14, 29];
  tree[61] = [44, 59];
  tree[62] = [60, 61];
  return tree;
})();

// Inverted: for each slot, which downstream (parent) slots depend on it.
// Used for computing downstream damage when a pick is wrong.
export const FORWARD_TREE = (() => {
  const forward = {};
  for (let s = 0; s < 63; s++) forward[s] = [];
  for (const [parent, feeders] of Object.entries(BRACKET_TREE)) {
    for (const feeder of feeders) {
      if (feeder != null) forward[feeder].push(Number(parent));
    }
  }
  return forward;
})();
