/**
 * paddles.test.js — the two paddles: staying on the field, and chasing.
 *
 * Both paddles move by the same helper, so the bugs are shared. A paddle that
 * can leave the field is only visible for the frame it is half off the top,
 * and a chase with no dead zone shivers in place at the target — neither
 * throws, and both look like "the physics feel a bit off".
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RULES,
  createState,
  clampPaddle,
  trackTowards,
  updateAI,
} = require('../engine.js');

const FIELD = { width: 800, height: 400 };
const centreOf = (paddle) => paddle.y + paddle.height / 2;

/* ---------------------------------------------------------- clampPaddle -- */

test('a paddle pushed off the top is put back on the field', () => {
  const paddle = { y: -50, height: RULES.paddleHeight };
  clampPaddle(paddle, FIELD);
  assert.equal(paddle.y, 0);
});

test('a paddle pushed off the bottom stops with its foot on the floor', () => {
  // Not its head: clamping to field.height would leave the whole paddle
  // hanging below the canvas, drawn but unreachable.
  const paddle = { y: 9999, height: RULES.paddleHeight };
  clampPaddle(paddle, FIELD);
  assert.equal(paddle.y, FIELD.height - RULES.paddleHeight);
  assert.equal(paddle.y + paddle.height, FIELD.height);
});

test('a paddle already on the field is left alone', () => {
  const paddle = { y: 120, height: RULES.paddleHeight };
  clampPaddle(paddle, FIELD);
  assert.equal(paddle.y, 120);
});

test('a paddle taller than the field still gets a defined position', () => {
  // The low bound wins over the high one, so it sits at the top rather than
  // at a negative y that nothing would draw.
  const paddle = { y: 50, height: FIELD.height + 200 };
  clampPaddle(paddle, FIELD);
  assert.equal(paddle.y, 0);
});

/* --------------------------------------------------------- trackTowards -- */

test('a paddle below its target moves up towards it', () => {
  const paddle = { y: 300, height: RULES.paddleHeight };
  trackTowards(paddle, 100, RULES.paddleSpeed, FIELD);
  assert.equal(paddle.y, 300 - RULES.paddleSpeed);
});

test('a paddle above its target moves down towards it', () => {
  const paddle = { y: 50, height: RULES.paddleHeight };
  trackTowards(paddle, 300, RULES.paddleSpeed, FIELD);
  assert.equal(paddle.y, 50 + RULES.paddleSpeed);
});

test('a paddle already on its target does not twitch', () => {
  // Inside the dead zone the step would overshoot, then overshoot back, every
  // frame forever. That shiver is the reason the dead zone exists.
  const paddle = { y: 150, height: RULES.paddleHeight };
  const target = centreOf(paddle);
  trackTowards(paddle, target, RULES.paddleSpeed, FIELD);
  assert.equal(paddle.y, 150);
});

test('the dead zone is the only thing that stops it', () => {
  const paddle = { y: 150, height: RULES.paddleHeight };
  const justOutside = centreOf(paddle) + RULES.deadZone + 1;
  trackTowards(paddle, justOutside, RULES.paddleSpeed, FIELD);
  assert.notEqual(paddle.y, 150);
});

test('chasing a target off the field does not take the paddle off with it', () => {
  const paddle = { y: 0, height: RULES.paddleHeight };
  for (let i = 0; i < 200; i += 1) trackTowards(paddle, -500, RULES.paddleSpeed, FIELD);
  assert.equal(paddle.y, 0);

  for (let i = 0; i < 200; i += 1) trackTowards(paddle, 5000, RULES.paddleSpeed, FIELD);
  assert.equal(paddle.y, FIELD.height - RULES.paddleHeight);
});

test('a paddle converges on its target and then stays there', () => {
  const paddle = { y: 0, height: RULES.paddleHeight };
  for (let i = 0; i < 500; i += 1) trackTowards(paddle, 200, RULES.paddleSpeed, FIELD);
  assert.ok(
    Math.abs(centreOf(paddle) - 200) <= RULES.deadZone + RULES.paddleSpeed,
    `settled at ${centreOf(paddle)}`,
  );
});

/* ------------------------------------------------------------- updateAI -- */

test('the computer follows the ball', () => {
  const state = createState();
  state.ball.y = 380;
  const before = state.paddles.right.y;
  updateAI(state);
  assert.ok(state.paddles.right.y > before, 'the computer ignored the ball');
});

test('the computer never leaves the field, wherever the ball goes', () => {
  const state = createState();
  for (const y of [-1000, 0, 400, 99999]) {
    state.ball.y = y;
    for (let i = 0; i < 200; i += 1) updateAI(state);
    const paddle = state.paddles.right;
    assert.ok(paddle.y >= 0, `y=${y} left the top`);
    assert.ok(paddle.y + paddle.height <= state.field.height, `y=${y} left the bottom`);
  }
});

test('the computer moves at its own speed, not the player’s', () => {
  // They are deliberately different: an AI as fast as the player is unbeatable.
  const state = createState();
  state.ball.y = state.field.height - 10;
  const before = state.paddles.right.y;
  updateAI(state);
  assert.equal(state.paddles.right.y - before, RULES.aiSpeed);
});
