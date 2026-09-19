/** Exact rational expression solver, with no eval and solvable generated cards. */
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));


function frac(n, d = 1) {
  if (d === 0) return null;
  if (d < 0) { n = -n; d = -d; }
  const g = gcd(n, d) || 1;
  return [n / g, d / g];
}

const add = (a, b) => frac(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
const sub = (a, b) => frac(a[0] * b[1] - b[0] * a[1], a[1] * b[1]);
const mul = (a, b) => frac(a[0] * b[0], a[1] * b[1]);
const div = (a, b) => (b[0] === 0 ? null : frac(a[0] * b[1], a[1] * b[0]));

export const OPS = [
  { sym: '+', fn: add, commutative: true },
  { sym: '×', fn: mul, commutative: true },
  { sym: '−', fn: sub, commutative: false },
  { sym: '÷', fn: div, commutative: false },
];


function reachable(items) {
  if (items.length === 1) return new Map([[key(items[0].v), items[0].e]]);
  const out = new Map();
  for (let i = 0; i < items.length; i += 1) {
    for (let j = 0; j < items.length; j += 1) {
      if (i === j) continue;
      const rest = items.filter((_, k) => k !== i && k !== j);
      for (const op of OPS) {

        if (op.commutative && j < i) continue;
        const v = op.fn(items[i].v, items[j].v);
        if (!v) continue;
        const e = `(${items[i].e} ${op.sym} ${items[j].e})`;
        for (const [k, expr] of reachable([...rest, { v, e }])) {
          if (!out.has(k)) out.set(k, expr);
        }
      }
    }
  }
  return out;
}

const key = (v) => `${v[0]}/${v[1]}`;


/** Return at most one exact solution, or an empty list. A nonpositive limit returns none. */
export function solve(numbers, target, limit = 6) {
  const items = numbers.map((n) => ({ v: frac(n), e: String(n) }));
  const all = reachable(items);
  const want = key(frac(target));
  const hit = all.get(want);
  return hit ? [hit].slice(0, limit) : [];
}

export function isSolvable(numbers, target) {
  return solve(numbers, target).length > 0;
}


export function evaluate(node) {
  if (typeof node === 'number') return frac(node);
  const a = evaluate(node.a);
  const b = evaluate(node.b);
  if (!a || !b) return null;
  const op = OPS.find((o) => o.sym === node.op);
  return op ? op.fn(a, b) : null;
}

export function equals(value, target) {
  if (!value) return false;
  const t = frac(target);
  return value[0] === t[0] && value[1] === t[1];
}

export function pretty(value) {
  if (!value) return '?';
  return value[1] === 1 ? String(value[0]) : `${value[0]}/${value[1]}`;
}


export function makeCard(tier, rng = Math.random) {
  const pick = (n) => 1 + Math.floor(rng() * n);
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const count = tier >= 3 ? 4 : tier === 2 ? 4 : 3;
    const max = tier >= 3 ? 12 : tier === 2 ? 9 : 6;
    const numbers = Array.from({ length: count }, () => pick(max));
    const targets = tier >= 3 ? [24, 36, 48, 60] : tier === 2 ? [12, 18, 20, 24] : [6, 8, 10, 12];
    const target = targets[Math.floor(rng() * targets.length)];
    const solutions = solve(numbers, target);
    if (solutions.length) return { numbers, target, solution: solutions[0] };
  }

  return { numbers: [2, 3, 4], target: 24, solution: '((2 × 3) × 4)' };
}
