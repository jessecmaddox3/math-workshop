

import { makeCard, evaluate, equals, pretty, solve } from './solver.js';
import { initProgress, readName, readLocal, writeLocal, sync, getAutoAdvance, setAutoAdvance } from '../shared/progress.js';

async function main() {
await initProgress('target');
const GAME = 'target';
const HINT_DELAY_MS = 45000;
const ADVANCE_MS = 2600;

const el = (id) => document.getElementById(id);

const saved = readLocal(GAME);
const state = {
  tier: saved.tier ?? 1,
  solved: saved.solved ?? 0,
  extras: saved.extras ?? 0,
  streak: 0,
  items: new Map(Object.entries(saved.items ?? {})),
};

let card = null;
let chips = [];          // { id, node, label }
let selected = [];       // chip ids
let op = null;
let history = [];
let steps = [];          // the written record: "3 + 6 = 9"
let solutionsFound = [];
let hintTimer = null;
let advanceTimer = null;
let nextId = 0;
let attemptFinished = false;

const OPS = ['+', '−', '×', '÷'];

function save() {
  writeLocal(GAME, {
    tier: state.tier, solved: state.solved, extras: state.extras,
    items: Object.fromEntries(state.items),
  });
  sync(GAME, readName(), state.items);
}


function newCard(sameCard = false) {
  clearTimeout(hintTimer);
  clearTimeout(advanceTimer);
  if (!sameCard) {
    card = makeCard(state.tier);
    solutionsFound = [];
  }
  attemptFinished = false;
  chips = card.numbers.map((n) => ({ id: nextId++, node: n, label: String(n) }));
  selected = [];
  op = null;
  history = [];
  steps = [];
  el('target').textContent = String(card.target);
  el('start-nums').textContent = card.numbers.join('  ·  ');
  el('feedback').hidden = true;
  el('feedback').className = 'feedback';
  el('hint').hidden = true;
  el('found').innerHTML = '';
  render();
  hintTimer = setTimeout(showHint, HINT_DELAY_MS);
}

function render() {
  const focus = document.activeElement;
  const focusedChip = focus?.dataset?.id;
  const focusedOp = focus?.dataset?.op;
  el('nums').innerHTML = chips.map((c) => {
    const value = pretty(evaluate(c.node));


    const made = c.label !== value ? `<small>${c.label}</small>` : '';
    return `<button class="num${selected.includes(c.id) ? ' sel' : ''}${made ? ' fused' : ''}"
                    type="button" aria-pressed="${selected.includes(c.id)}" data-id="${c.id}">${value}${made}</button>`;
  }).join('');
  el('nums').querySelectorAll('.num').forEach((b) => {
    b.addEventListener('click', () => tapChip(Number(b.dataset.id)));
  });


  // a highlighted sign that clears itself looks like a sign that got used up.
  el('ops').innerHTML = OPS.map((o) =>
    `<button class="op${op === o ? ' sel' : ''}" type="button" aria-pressed="${op === o}" aria-label="${({'+':'Add','−':'Subtract','×':'Multiply','÷':'Divide'})[o]}" data-op="${o}">${o}</button>`).join('');
  el('ops').querySelectorAll('.op').forEach((b) => {
    b.addEventListener('click', () => { op = b.dataset.op; tryCombine(); render(); });
  });

  el('steps').innerHTML = steps.length
    ? `<p class="steps-label">Your work</p><ol>${steps.map((s) => `<li>${s}</li>`).join('')}</ol>`
    : '';

  el('helper').innerHTML = helperText();
  el('solved').textContent = String(state.solved);
  el('extras').textContent = String(state.extras);
  if (focusedChip !== undefined) (el('nums').querySelector(`[data-id="${focusedChip}"]`) || el('nums').lastElementChild)?.focus();
  else if (focusedOp !== undefined) el('ops').querySelector(`[data-op="${focusedOp}"]`)?.focus();
}


function helperText() {
  if (chips.length === 1) return '';
  const left = chips.length;
  const joins = left - 1;
  if (selected.length === 0) {
    return `Tap two numbers and a sign to join them into one. `
      + `<b>${joins} more join${joins === 1 ? '' : 's'}</b> to go, then you are down to a single number.`;
  }
  if (selected.length === 1) return 'Now tap the second number.';
  return op ? '' : 'Now pick a sign. You can use the same sign as many times as you like.';
}

function tapChip(id) {
  if (selected.includes(id)) selected = selected.filter((s) => s !== id);
  else if (selected.length < 2) selected.push(id);
  else selected = [selected[1], id];
  tryCombine();
  render();
}


function bracket(chip) {
  return chip.label === pretty(evaluate(chip.node)) ? chip.label : `(${chip.label})`;
}

function tryCombine() {
  if (selected.length !== 2 || !op) return;
  const [aId, bId] = selected;
  const a = chips.find((c) => c.id === aId);
  const b = chips.find((c) => c.id === bId);
  const node = { op, a: a.node, b: b.node };
  const value = evaluate(node);

  if (!value) {
    // Only division by zero lands here. Say so plainly rather than silently

    flash('nudge', 'You cannot divide by zero. Try a different pair.');
    selected = [];
    op = null;
    return;
  }

  const label = `${bracket(a)} ${op} ${bracket(b)}`;
  history.push({ chips: [...chips], steps: [...steps] });
  steps.push(`${label} = <b>${pretty(value)}</b>`);
  chips = chips.filter((c) => c.id !== aId && c.id !== bId);
  chips.push({ id: nextId++, node, label });
  selected = [];
  op = null;

  if (chips.length === 1) finishAttempt();
}

function finishAttempt() {
  if (attemptFinished) return;
  attemptFinished = true;
  const only = chips[0];
  const value = evaluate(only.node);
  clearTimeout(hintTimer);
  const key = `t${card.target}`;
  const prev = state.items.get(key) ?? { streak: 0, attempts: 0, correct: 0, mastered: false };
  if (equals(value, card.target)) {
    const expr = only.label;
    const isNew = !solutionsFound.includes(expr);
    if (isNew) {
      solutionsFound.push(expr);
      prev.attempts += 1; prev.correct += 1; prev.streak += 1;
      prev.mastered = prev.streak >= 2;
      state.items.set(key, prev);
      if (solutionsFound.length === 1) {
        state.solved += 1; state.streak += 1;
        if (state.streak >= 3 && state.tier < 3) { state.tier += 1; state.streak = 0; }
      } else state.extras += 1;
      save();
    }
    const verdict = !isNew ? 'Same route as before.' : solutionsFound.length === 1 ? `Exactly ${card.target}.` : 'Another route.';
    flash('good', `<span class="verdict">${verdict}</span> <code>${expr}</code>`);
    queueAdvance();
  } else {
    prev.attempts += 1; prev.streak = 0; prev.mastered = false;
    state.items.set(key, prev); state.streak = 0; save();
    flash('bad', `<span class="verdict">That makes ${pretty(value)}, not ${card.target}.</span> <span class="gloss">Undo a step and try a different pairing.</span>`);
  }
  render();
}

function queueAdvance() {
  clearTimeout(advanceTimer);
  if (autoAdvance.checked) el('feedback').classList.add('advancing');
  el('found').innerHTML =
    `<button class="ghost" type="button" id="again">Find another way</button><button class="primary" type="button" id="next-card">Next card →</button>`;
  el('next-card').addEventListener('click', () => newCard());
  el('again').addEventListener('click', () => {
    clearTimeout(advanceTimer);
    el('feedback').classList.remove('advancing');
    newCard(true);
  });
  if (autoAdvance.checked) advanceTimer = setTimeout(() => newCard(), ADVANCE_MS);
}

function flash(kind, html) {
  const fb = el('feedback');
  fb.className = `feedback ${kind}`;
  fb.innerHTML = html;
  fb.hidden = false;
}


function showHint() {
  const [first] = solve(card.numbers, card.target);
  if (!first) return;

  const inner = first.match(/\(([^()]+)\)/);
  el('hint').innerHTML = inner
    ? `From the original numbers, try making <b>${evaluateSnippet(inner[1])}</b> first. Use Undo or Start over if your current chips have taken a different route.`
    : `From the original numbers, think about which pair gets you closest to a factor of ${card.target}. Use Undo or Start over to try it.`;
  el('hint').hidden = false;
}

function evaluateSnippet(snippet) {
  const m = snippet.match(/^(\d+) (.) (\d+)$/);
  if (!m) return snippet;
  const node = { op: m[2], a: Number(m[1]), b: Number(m[3]) };
  return pretty(evaluate(node));
}

el('undo').addEventListener('click', () => {
  if (!history.length) return;
  clearTimeout(advanceTimer);
  attemptFinished = false;
  clearTimeout(hintTimer); hintTimer = setTimeout(showHint, HINT_DELAY_MS);
  el('hint').hidden = true;
  const back = history.pop();
  chips = back.chips;
  steps = back.steps;
  selected = [];
  op = null;
  el('feedback').hidden = true;
  el('feedback').className = 'feedback';
  el('found').innerHTML = '';
  render();
});
el('reset').addEventListener('click', () => newCard(true));
el('skip').addEventListener('click', () => newCard());

const autoAdvance = el('auto-advance');
autoAdvance.checked = getAutoAdvance();
autoAdvance.addEventListener('change', () => {
  setAutoAdvance(autoAdvance.checked);
  clearTimeout(advanceTimer); el('feedback').classList.remove('advancing');
  if (attemptFinished && equals(evaluate(chips[0].node), card.target)) queueAdvance();
});
document.addEventListener('progress-loaded',()=>{ const fresh=readLocal(GAME);state.tier=fresh.tier;state.solved=fresh.solved;state.extras=fresh.extras;state.streak=0;state.items=new Map(Object.entries(fresh.items));autoAdvance.checked=getAutoAdvance();newCard(); });
document.addEventListener('progress-retired',()=>{ clearTimeout(hintTimer); clearTimeout(advanceTimer); });
window.addEventListener('pagehide', () => { clearTimeout(hintTimer); clearTimeout(advanceTimer); });
newCard();

}
main().catch(error=>{const p=document.createElement("p");p.setAttribute("role","alert");p.textContent=error.message;document.querySelector(".wrap").prepend(p);});
