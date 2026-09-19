

import { PUZZLES, valueOf, answerOf } from './puzzles.js';
import { initProgress, readName, readLocal, writeLocal, sync } from '../shared/progress.js';

async function main() {
await initProgress('areamaze');
const GAME = 'areamaze';
const HINT_DELAY_MS = 45000;
const el = (id) => document.getElementById(id);

const saved = readLocal(GAME);
const state = {
  tier: saved.tier ?? 1,
  solved: saved.solved ?? 0,
  streak: 0,
  done: new Set(saved.done ?? []),
  items: new Map(Object.entries(saved.items ?? {})),
};

let puzzle = null;
let hintTimer = null;
let tries = 0;

const rand = (n) => Math.floor(Math.random() * n);

function save() {
  writeLocal(GAME, {
    tier: state.tier, solved: state.solved, done: [...state.done],
    items: Object.fromEntries(state.items),
  });
  sync(GAME, readName(), state.items);
}

function pick() {
  let pool = PUZZLES.filter((p) => p.tier === state.tier && !state.done.has(p.id));
  if (!pool.length) pool = PUZZLES.filter((p) => p.tier === state.tier);
  if (!pool.length) pool = PUZZLES;
  return pool[rand(pool.length)];
}

function newPuzzle() {
  clearTimeout(hintTimer);
  tries = 0;
  puzzle = pick();
  el('feedback').hidden = true;
  el('hint').hidden = true;
  el('guess').value = '';
  el('guess').disabled = false;
  el('check').disabled = false;
  el('tier').textContent = String(state.tier);
  el('solved').textContent = String(state.solved);
  draw();
  el('guess').focus();
  hintTimer = setTimeout(() => {
    el('hint').textContent = puzzle.idea;
    el('hint').hidden = false;
  }, HINT_DELAY_MS);
}

function draw() {
  const maze = el('maze');
  maze.className = `maze ${puzzle.layout}`;
  maze.innerHTML = '';
  const shown = new Set(puzzle.given);
  const words={w:'width',h:'height',a:'area'};
  const clues=puzzle.given.map(ref=>{const [i,kind]=ref.split('.');return `Rectangle ${Number(i)+1} ${words[kind]} ${valueOf(puzzle,ref)}`;});
  const [asked,kind]=puzzle.ask.split('.');
  maze.setAttribute('role','img');
  maze.setAttribute('aria-label',`${puzzle.layout==='row'?'Side-by-side rectangles with the same height':'Stacked rectangles with the same width'}. ${clues.join('. ')}. Find rectangle ${Number(asked)+1} ${words[kind]}. Diagram not to scale.`);

  puzzle.cells.forEach((cell, i) => {
    const div = document.createElement('div');
    div.className = 'cell';


    // sensible diagram rather than a glitch.
    const jitter = 0.7 + ((i * 37) % 60) / 100;
    if (puzzle.layout === 'row') {
      div.style.width = `${96 * jitter}px`;
      div.style.height = '150px';
      div.style.flex = `${jitter} 1 0`;
      div.style.minWidth = '0';
    } else {
      div.style.height = `${74 * jitter}px`;
      div.style.width = 'min(240px, 100%)';
    }

    const areaShown = shown.has(`${i}.a`);
    const isAskArea = puzzle.ask === `${i}.a`;
    div.innerHTML = `<span class="area${isAskArea ? ' q' : ''}">`
      + (areaShown ? cell.a : (isAskArea ? '?' : '')) + '</span>';

    const wShown = shown.has(`${i}.w`);
    const hShown = shown.has(`${i}.h`);
    const askW = puzzle.ask === `${i}.w`;
    const askH = puzzle.ask === `${i}.h`;
    if (wShown || askW) {
      div.insertAdjacentHTML('beforeend',
        `<span class="side top${askW ? ' q' : ''}">${askW ? '?' : cell.w}</span>`);
    }
    if (hShown || askH) {
      div.insertAdjacentHTML('beforeend',
        `<span class="side left${askH ? ' q' : ''}">${askH ? '?' : cell.h}</span>`);
    }
    maze.appendChild(div);
  });
}

function check() {
  if (el('guess').disabled) return;
  const want = answerOf(puzzle);
  const got = Number(el('guess').value.trim());
  const fb = el('feedback');

  if (!el('guess').value.trim() || !Number.isFinite(got)) {
    fb.className = 'feedback nudge';
    fb.textContent = 'Type a number.';
    fb.hidden = false;
    return;
  }

  tries += 1;
  const key = puzzle.id;
  const prev = state.items.get(key) ?? { streak: 0, attempts: 0, correct: 0, mastered: false };
  prev.attempts += 1;

  if (got === want) {
    clearTimeout(hintTimer);
    prev.correct += 1; prev.streak += 1; prev.mastered = true;
    state.items.set(key, prev);
    state.done.add(puzzle.id);
    state.solved += 1;
    state.streak += 1;
    fb.className = 'feedback good';
    fb.innerHTML = `<span class="verdict">${want}. Correct.</span> `
      + `<span class="gloss">${puzzle.idea}</span>`;
    el('guess').disabled = true;
    el('check').disabled = true;

    if (state.streak >= 3 && state.tier < 3) { state.tier += 1; state.streak = 0; }
    save();

    const next = document.createElement('button');
    next.className = 'primary';
    next.type = 'button';
    next.textContent = 'next →';
    next.style.marginTop = '14px';
    next.addEventListener('click', newPuzzle);
    fb.appendChild(next);
  } else {
    prev.streak = 0;
    state.items.set(key, prev);
    state.streak = 0;
    save();
    fb.className = 'feedback bad';


    fb.innerHTML = tries >= 2
      ? `<span class="verdict">Not ${got}.</span> <span class="gloss">${puzzle.idea}</span>`
      : `<span class="verdict">Not ${got}.</span> <span class="gloss">Look for two rectangles that share a side.</span>`;
  }
  fb.hidden = false;
}

el('check').addEventListener('click', check);
el('guess').addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });
el('skip').addEventListener('click', newPuzzle);

document.addEventListener('progress-loaded',()=>{ const fresh=readLocal(GAME);state.tier=fresh.tier;state.solved=fresh.solved;state.streak=0;state.done=new Set(fresh.done);state.items=new Map(Object.entries(fresh.items));newPuzzle(); });
document.addEventListener('progress-retired',()=>{ clearTimeout(hintTimer);  });
window.addEventListener('pagehide',()=>clearTimeout(hintTimer));
newPuzzle();

}
main().catch(error=>{const p=document.createElement("p");p.setAttribute("role","alert");p.textContent=error.message;document.querySelector(".wrap").prepend(p);});
