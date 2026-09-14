/**
 * input.test.js — the player's paddle, driven by keys and by the pointer.
 *
 * Input is the half of the game nobody tests, because testing it usually
 * means testing a browser. updatePlayer takes a plain reading of what the
 * browser last knew — which keys are down, where the pointer is, which of the
 * two is actually driving — so the awkward cases are just objects.
 *
 * The awkward cases are real ones: the arrow keys used to do nothing at all
 * while the mouse rested anywhere on the page, because the pointer branch ran
 * every frame and pulled the paddle straight back.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { RULES, createState, updatePlayer } = require('../engine.js');

const centre = (state) => state.paddles.left.y + state.paddles.left.height / 2;

/* ----------------------------------------------------------------- keys -- */

test('holding up moves the paddle up by its speed', () => {
  const state = createState();
  const before = state.paddles.left.y;
  updatePlayer(state, { up: true });
  assert.equal(state.paddles.left.y, before - RULES.paddleSpeed);
});

test('holding down moves the paddle down by its speed', () => {
  const state = createState();
  const before = state.paddles.left.y;
  updatePlayer(state, { down: true });
  assert.equal(state.paddles.left.y, before + RULES.paddleSpeed);
});

test('holding both keys holds the paddle still', () => {
  const state = createState();
  const before = state.paddles.left.y;
  updatePlayer(state, { up: true, down: true });
  assert.equal(state.paddles.left.y, before);
});

test('the keys cannot push the paddle off the field', () => {
  const state = createState();
  for (let i = 0; i < 300; i += 1) updatePlayer(state, { up: true });
  assert.equal(state.paddles.left.y, 0);

  for (let i = 0; i < 300; i += 1) updatePlayer(state, { down: true });
  assert.equal(
    state.paddles.left.y,
    state.field.height - state.paddles.left.height,
  );
});

/* -------------------------------------------------------------- pointer -- */

test('the paddle follows the pointer when the pointer is driving', () => {
  const state = createState();
  const before = state.paddles.left.y;
  updatePlayer(state, { pointer: true, pointerY: 380 });
  assert.ok(state.paddles.left.y > before, 'the paddle ignored the pointer');
});

test('the paddle settles on the pointer rather than shivering at it', () => {
  const state = createState();
  for (let i = 0; i < 200; i += 1) updatePlayer(state, { pointer: true, pointerY: 120 });
  const settled = centre(state);

  updatePlayer(state, { pointer: true, pointerY: 120 });
  assert.equal(centre(state), settled, 'the paddle moved after it had arrived');
  assert.ok(Math.abs(settled - 120) <= RULES.deadZone + RULES.paddleSpeed);
});

test('a pointer that is not driving is ignored', () => {
  // This is the regression. The mouse rests somewhere — anywhere — and the
  // paddle was dragged back to it every single frame, so the arrow keys
  // looked broken.
  const state = createState();
  const before = state.paddles.left.y;
  updatePlayer(state, { pointer: false, pointerY: 10 });
  assert.equal(state.paddles.left.y, before);
});

test('keys win over a pointer that is also reading', () => {
  const state = createState();
  const before = state.paddles.left.y;
  updatePlayer(state, { up: true, pointer: true, pointerY: 390 });
  assert.equal(state.paddles.left.y, before - RULES.paddleSpeed, 'the pointer won');
});

test('the pointer cannot drag the paddle off the field', () => {
  const state = createState();
  for (let i = 0; i < 300; i += 1) updatePlayer(state, { pointer: true, pointerY: -9999 });
  assert.equal(state.paddles.left.y, 0);

  for (let i = 0; i < 300; i += 1) updatePlayer(state, { pointer: true, pointerY: 9999 });
  assert.equal(
    state.paddles.left.y,
    state.field.height - state.paddles.left.height,
  );
});

/* ------------------------------------------------------- nothing at all -- */

test('no input at all leaves the paddle exactly where it was', () => {
  const state = createState();
  const before = state.paddles.left.y;
  updatePlayer(state);
  updatePlayer(state, {});
  assert.equal(state.paddles.left.y, before);
});

test('a pointer position that is not a number is ignored, not followed', () => {
  // getBoundingClientRect returns a zero-height rect for a hidden canvas, and
  // the conversion into buffer coordinates divides by that height. NaN moved
  // the paddle to NaN, and from then on nothing was drawn at all.
  const state = createState();
  const before = state.paddles.left.y;
  for (const bad of [NaN, undefined, null, Infinity, '200']) {
    updatePlayer(state, { pointer: true, pointerY: bad });
    assert.equal(state.paddles.left.y, before, `pointerY ${String(bad)} moved the paddle`);
  }
});
