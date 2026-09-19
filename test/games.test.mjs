let seed=173; const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
import test from "node:test";
import assert from "node:assert/strict";

import {
  solve, isSolvable, makeCard, evaluate, equals, pretty,
} from "../public/target/solver.js";
import { PUZZLES, valueOf, answerOf } from "../public/areamaze/puzzles.js";



test("solves the standard 24 card", () => {
  const found = solve([3, 4, 6, 8], 24);
  assert.ok(found.length, "3 4 6 8 must make 24");
});

test("uses rationals, so fractional intermediates are found", () => {
  // 8 / (3 - 8/3) = 24. A float implementation gets 23.999... and rejects it.


  assert.ok(isSolvable([8, 3, 3, 8], 24), "must find 8/(3-8/3)");
});

test("reports genuinely impossible cards as impossible", () => {
  assert.equal(solve([1, 1, 1, 1], 24).length, 0);
  assert.equal(solve([1, 1, 2], 100).length, 0);
});

test("never divides by zero into a false solution", () => {

  // "solves" everything.
  const found = solve([5, 5, 0], 24);
  assert.equal(found.length, 0);
});

test("every generated card is actually solvable", () => {
  for (const tier of [1, 2, 3]) {
    for (let i = 0; i < 25; i += 1) {
      const card = makeCard(tier, rng);
      assert.ok(isSolvable(card.numbers, card.target),
        `tier ${tier} produced an unsolvable card: ${card.numbers} -> ${card.target}`);
    }
  }
});

test("generated cards get harder with tier", () => {
  const spread = (tier) => {
    let maxNum = 0;
    for (let i = 0; i < 30; i += 1) {
      maxNum = Math.max(maxNum, ...makeCard(tier, rng).numbers);
    }
    return maxNum;
  };
  assert.ok(spread(3) > spread(1), "tier 3 should reach larger numbers than tier 1");
});

test("evaluate handles a nested expression tree without eval", () => {
  const tree = { op: "×", a: { op: "+", a: 2, b: 4 }, b: { op: "−", a: 8, b: 4 } };
  assert.ok(equals(evaluate(tree), 24));
  assert.equal(pretty(evaluate(tree)), "24");
});

test("evaluate returns null rather than Infinity on divide by zero", () => {
  assert.equal(evaluate({ op: "÷", a: 5, b: 0 }), null);
});

test("fractions are reduced and printed readably", () => {
  assert.equal(pretty(evaluate({ op: "÷", a: 8, b: 3 })), "8/3");
  assert.equal(pretty(evaluate({ op: "÷", a: 6, b: 3 })), "2");
});



test("every area maze is internally consistent", () => {
  for (const p of PUZZLES) {
    for (const [i, c] of p.cells.entries()) {
      assert.equal(c.w * c.h, c.a,
        `${p.id} cell ${i}: ${c.w} x ${c.h} should be ${c.w * c.h}, not ${c.a}`);
    }
  }
});

test("rectangles in a row share a height; in a column, a width", () => {


  for (const p of PUZZLES) {
    const shared = p.layout === "row" ? "h" : "w";
    const values = new Set(p.cells.map((c) => c[shared]));
    assert.equal(values.size, 1,
      `${p.id} is a ${p.layout} but its cells do not share ${shared}: ${[...values]}`);
  }
});

test("every answer is a positive whole number", () => {
  for (const p of PUZZLES) {
    const a = answerOf(p);
    assert.ok(Number.isInteger(a) && a > 0, `${p.id} answers ${a}`);
  }
});

test("the asked-for value is never also given away", () => {
  for (const p of PUZZLES) {
    assert.ok(!p.given.includes(p.ask), `${p.id} shows the answer in its given values`);
  }
});

test("every given reference points at a real cell and field", () => {
  for (const p of PUZZLES) {
    for (const ref of [...p.given, p.ask]) {
      const [i, field] = ref.split(".");
      assert.ok(p.cells[Number(i)], `${p.id}: no cell ${i}`);
      assert.ok(["w", "h", "a"].includes(field), `${p.id}: bad field ${field}`);
      assert.equal(typeof valueOf(p, ref), "number");
    }
  }
});

test("each puzzle is solvable from ONLY its given values", () => {


  // value becomes derivable. A puzzle that fails this is unfair, not hard.
  for (const p of PUZZLES) {
    const known = new Map();
    const shared = p.layout === "row" ? "h" : "w";
    for (const ref of p.given) known.set(ref, valueOf(p, ref));

    for (let pass = 0; pass < 12; pass += 1) {
      for (let i = 0; i < p.cells.length; i += 1) {
        const w = known.get(`${i}.w`);
        const h = known.get(`${i}.h`);
        const a = known.get(`${i}.a`);
        if (w != null && h != null && a == null) known.set(`${i}.a`, w * h);
        if (a != null && w != null && h == null) known.set(`${i}.h`, a / w);
        if (a != null && h != null && w == null) known.set(`${i}.w`, a / h);
      }

      for (let i = 0; i < p.cells.length; i += 1) {
        const v = known.get(`${i}.${shared}`);
        if (v != null) {
          for (let j = 0; j < p.cells.length; j += 1) known.set(`${j}.${shared}`, v);
          break;
        }
      }
    }
    assert.equal(known.get(p.ask), answerOf(p),
      `${p.id} cannot be derived from what it shows the player`);
  }
});

test("there are enough puzzles at every tier to avoid immediate repeats", () => {
  for (const tier of [1, 2, 3]) {
    const n = PUZZLES.filter((p) => p.tier === tier).length;
    assert.ok(n >= 5, `tier ${tier} has only ${n} puzzles`);
  }
});

test("every puzzle carries a structural idea for its hint", () => {
  for (const p of PUZZLES) {
    assert.ok(p.idea && p.idea.length > 25, `${p.id} needs a real hint`);
    assert.ok(!p.idea.includes(String(answerOf(p))),
      `${p.id}'s hint contains the answer`);
  }
});
