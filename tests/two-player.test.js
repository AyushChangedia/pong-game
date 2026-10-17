/**
 * two-player.test.js — the right paddle, driven by a person.
 *
 * updatePlayer was written for the left paddle and had the side baked into
 * it. Everything else about moving a paddle is identical, so the only real
 * question is whether the two sides can get out of step — which is why the
 * loop makes one call either way and this file checks both ends of it.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const E = require('../engine.js');
const { RULES, createState, updatePlayer, updateOpponent } = E;

const twoPlayer = () => {
  const state = createState();
  state.twoPlayer = true;
  return state;
};

/* -------------------------------------------------------------- the side -- */

test('a new match is against the computer', () => {
  assert.equal(createState().twoPlayer, false);
});

test('the left paddle is still the default', () => {
  const state = createState();
  const before = state.paddles.left.y;
  updatePlayer(state, { up: true });
  assert.equal(state.paddles.left.y, before - RULES.paddleSpeed);
});

test('the right paddle can be driven by name', () => {
  const state = createState();
  const before = state.paddles.right.y;
  updatePlayer(state, { down: true }, 'right');
  assert.equal(state.paddles.right.y, before + RULES.paddleSpeed);
});

test('driving one side does not move the other', () => {
  const state = createState();
  const left = state.paddles.left.y;
  updatePlayer(state, { up: true }, 'right');
  assert.equal(state.paddles.left.y, left);
});

test('both paddles move at the same speed', () => {
  // A second player on a slower paddle is not a second player.
  const state = createState();
  const left = state.paddles.left.y;
  const right = state.paddles.right.y;

  updatePlayer(state, { up: true }, 'left');
  updatePlayer(state, { up: true }, 'right');

  assert.equal(left - state.paddles.left.y, right - state.paddles.right.y);
});

test('the right paddle cannot be pushed off the field either', () => {
  const state = createState();
  for (let i = 0; i < 300; i += 1) updatePlayer(state, { up: true }, 'right');
  assert.equal(state.paddles.right.y, 0);

  for (let i = 0; i < 300; i += 1) updatePlayer(state, { down: true }, 'right');
  assert.equal(
    state.paddles.right.y,
    state.field.height - state.paddles.right.height,
  );
});

/* ---------------------------------------------------------- the opponent -- */

test('against the computer the right paddle follows the ball', () => {
  const state = createState();
  state.ball.x = 700;
  state.ball.y = 395;
  const before = state.paddles.right.y;

  updateOpponent(state, {});

  assert.notEqual(state.paddles.right.y, before, 'the computer ignored the ball');
});

test('in two-player the right paddle follows the keys instead', () => {
  const state = twoPlayer();
  // The ball is low, so the computer would be moving down. The keys say up.
  state.ball.x = 700;
  state.ball.y = 395;
  const before = state.paddles.right.y;

  updateOpponent(state, { up: true });

  assert.equal(state.paddles.right.y, before - RULES.paddleSpeed);
});

test('in two-player an idle hand leaves the paddle where it is', () => {
  // The computer would have chased the ball. A person who is not pressing
  // anything has decided not to.
  const state = twoPlayer();
  state.ball.x = 799;
  state.ball.y = 399;
  const before = state.paddles.right.y;

  for (let i = 0; i < 60; i += 1) updateOpponent(state, {});

  assert.equal(state.paddles.right.y, before);
});

test('switching back hands the paddle to the computer again', () => {
  const state = twoPlayer();
  state.ball.x = 700;
  state.ball.y = 395;

  state.twoPlayer = false;
  const before = state.paddles.right.y;
  updateOpponent(state, {});

  assert.notEqual(state.paddles.right.y, before);
});

test('a two-player paddle takes a pointer as well as keys', () => {
  // Two people on one touchscreen is a real way to play this.
  const state = twoPlayer();
  const before = state.paddles.right.y;
  updateOpponent(state, { pointer: true, pointerY: 390 });
  assert.ok(state.paddles.right.y > before);
});

test('a point can be played out between two people', () => {
  const state = twoPlayer();
  E.serve(state, () => 0.9);

  const left = { pointer: true, pointerY: 0 };
  const right = { pointer: true, pointerY: 0 };

  for (let i = 0; i < 4000 && !state.gameOver; i += 1) {
    left.pointerY = state.ball.y;
    right.pointerY = state.ball.y;
    updatePlayer(state, left);
    updateOpponent(state, right);
    E.stepBall(state);
  }

  // Two players tracking the ball exactly should rally, not concede in a
  // handful of steps — the point is that neither side is being ignored.
  assert.ok(state.rally > 5, `the rally only reached ${state.rally}`);
});
