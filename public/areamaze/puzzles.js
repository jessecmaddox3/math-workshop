/** Seventeen original area puzzles, inspired by Naoki Inaba’s Menseki Meiro. */
export const PUZZLES = [

  { id: 'a1', tier: 1, layout: 'row', cells: [
      { w: 4, h: 5, a: 20 }, { w: 3, h: 5, a: 15 }],
    given: ['0.a', '0.w', '1.a'], ask: '1.w',
    idea: 'Both rectangles are the same height. Find that height from the first one.' },
  { id: 'a2', tier: 1, layout: 'row', cells: [
      { w: 6, h: 3, a: 18 }, { w: 5, h: 3, a: 15 }],
    given: ['0.w', '0.a', '1.w'], ask: '1.a',
    idea: 'Same height again. Get it once and the second area follows.' },
  { id: 'a3', tier: 1, layout: 'col', cells: [
      { w: 7, h: 2, a: 14 }, { w: 7, h: 6, a: 42 }],
    given: ['0.a', '0.h', '1.h'], ask: '1.a',
    idea: 'Stacked rectangles share a width.' },
  { id: 'a4', tier: 1, layout: 'row', cells: [
      { w: 8, h: 4, a: 32 }, { w: 2, h: 4, a: 8 }],
    given: ['0.a', '0.w', '1.a'], ask: '1.w', idea: 'Find the shared height first.' },
  { id: 'a5', tier: 1, layout: 'col', cells: [
      { w: 5, h: 9, a: 45 }, { w: 5, h: 4, a: 20 }],
    given: ['0.a', '0.h', '1.a'], ask: '1.h', idea: 'Shared width, worked out from the top piece.' },


  { id: 'b1', tier: 2, layout: 'row', cells: [
      { w: 3, h: 8, a: 24 }, { w: 6, h: 8, a: 48 }, { w: 2, h: 8, a: 16 }],
    given: ['0.a', '0.w', '1.a', '2.w'], ask: '2.a',
    idea: 'Three rectangles, one shared height. Find it once and use it twice.' },
  { id: 'b2', tier: 2, layout: 'row', cells: [
      { w: 4, h: 7, a: 28 }, { w: 8, h: 7, a: 56 }],
    given: ['0.a', '1.a', '0.w'], ask: '1.w',
    idea: 'You are told both areas. Twice the area on the same height means twice the width.' },
  { id: 'b3', tier: 2, layout: 'col', cells: [
      { w: 9, h: 3, a: 27 }, { w: 9, h: 5, a: 45 }, { w: 9, h: 2, a: 18 }],
    given: ['0.a', '0.h', '1.h', '2.h'], ask: '2.a', idea: 'One width serves all three.' },
  { id: 'b4', tier: 2, layout: 'row', cells: [
      { w: 5, h: 12, a: 60 }, { w: 3, h: 12, a: 36 }],
    given: ['0.a', '1.a', '1.w'], ask: '0.w',
    idea: 'Work from the rectangle where you know both the area and a side.' },
  { id: 'b5', tier: 2, layout: 'col', cells: [
      { w: 6, h: 7, a: 42 }, { w: 6, h: 4, a: 24 }, { w: 6, h: 9, a: 54 }],
    given: ['1.a', '1.h', '0.h', '2.h'], ask: '2.a',
    idea: 'The middle rectangle is the one that gives you the shared width.' },
  { id: 'b6', tier: 2, layout: 'row', cells: [
      { w: 7, h: 6, a: 42 }, { w: 4, h: 6, a: 24 }],
    given: ['0.a', '0.w', '1.w'], ask: '1.a',
    idea: 'The left rectangle tells you the height both of them stand on.' },


  { id: 'c1', tier: 3, layout: 'row', cells: [
      { w: 3, h: 10, a: 30 }, { w: 9, h: 10, a: 90 }],
    given: ['0.a', '1.a', '0.w'], ask: '1.w',
    idea: 'Three times the area on the same height means three times the width. You never need the height itself.' },
  { id: 'c2', tier: 3, layout: 'col', cells: [
      { w: 8, h: 5, a: 40 }, { w: 8, h: 15, a: 120 }],
    given: ['0.a', '1.a', '0.h'], ask: '1.h',
    idea: 'Compare the two areas before you try to divide anything.' },
  { id: 'c3', tier: 3, layout: 'row', cells: [
      { w: 6, h: 11, a: 66 }, { w: 12, h: 11, a: 132 }, { w: 3, h: 11, a: 33 }],
    given: ['0.a', '1.a', '2.a', '0.w'], ask: '2.w',
    idea: 'All three share a height, so the areas are in the same ratio as the widths.' },
  { id: 'c4', tier: 3, layout: 'row', cells: [
      { w: 5, h: 13, a: 65 }, { w: 10, h: 13, a: 130 }],
    given: ['0.a', '1.a', '0.w'], ask: '1.w',
    idea: 'Twice the area at the same height means twice the width.' },
  { id: 'c5', tier: 3, layout: 'col', cells: [
      { w: 7, h: 4, a: 28 }, { w: 7, h: 12, a: 84 }, { w: 7, h: 3, a: 21 }],
    given: ['0.a', '1.a', '2.a', '0.h'], ask: '2.h',
    idea: 'Three areas, one shared width. Ratios again.' },
  { id: 'c6', tier: 3, layout: 'row', cells: [
      { w: 9, h: 14, a: 126 }, { w: 3, h: 14, a: 42 }],
    given: ['0.a', '1.a', '1.w'], ask: '0.w',
    idea: 'Which is bigger, and by how many times?' },
];


export function valueOf(puzzle, ref) {
  const [i, field] = ref.split('.');
  return puzzle.cells[Number(i)][field];
}

export function answerOf(puzzle) {
  return valueOf(puzzle, puzzle.ask);
}
