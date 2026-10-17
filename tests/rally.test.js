/**
 * rally.test.js — the ball gets harder the longer the exchange lasts.
 *
 * A rally at one constant speed has no shape: the twentieth exchange is as
 * easy as the first, so a long one ends because somebody stopped paying
 * attention rather than because it got hard.
 *
 * Speeding the ball up is the obvious fix and brings a less obvious problem
 * with it, which most of these tests are about: spin adds to dy, the cap
 * scales both components down to hold the total, and over enough returns that
 * grinds dx towards nothing. The ball ends up drifting between the walls
 * without ever reaching a paddle.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const E = require('../engine.js');
const { RULES, createState, keepMovingAcross, bounceOffPaddle, serve } = E;

/** A ball sitting on a paddle, about to be returned by it. */
function touching(side, ball) {
  const state = createState();
  const paddle = state.paddles[side];
  Object.assign(state.ball, {
    x: side === 'left' ? paddle.x + paddle.width : paddle.x,
    y: paddle.y + paddle.height / 2,
    ...ball,
  });
  return state;
}

const speedOf = (ball) => Math.hypot(ball.dx, ball.dy);

/* ------------------------------------------------------- the rally count -- */

test('a serve starts the rally at nothing', () => {
  const state = createState();
  state.rally = 9;
  serve(state, () => 0.5);
  assert.equal(state.rally, 0);
});

test('each return counts', () => {
  const state = touching('left', { dx: -4, dy: 1 });
  bounceOffPaddle(state, 'left');
  assert.equal(state.rally, 1);

  Object.assign(state.ball, { x: state.paddles.right.x, dx: 4 });
  state.ball.y = state.paddles.right.y + state.paddles.right.height / 2;
  bounceOffPaddle(state, 'right');
  assert.equal(state.rally, 2);
});

test('a miss does not count as a return', () => {
  const state = touching('left', { dx: -4, dy: 1 });
  state.ball.y = -500;
  bounceOffPaddle(state, 'left');
  assert.equal(state.rally, 0);
});

/* ------------------------------------------------------------ the speed -- */

test('the ball leaves a paddle faster than it arrived', () => {
  const state = touching('left', { dx: -4, dy: 1 });
  const before = speedOf(state.ball);
  bounceOffPaddle(state, 'left');
  assert.ok(speedOf(state.ball) > before, `${speedOf(state.ball)} is not faster than ${before}`);
});

test('the speed-up is a multiplier, so it compounds over a rally', () => {
  const state = touching('left', { dx: -2, dy: 0 });
  bounceOffPaddle(state, 'left');
  assert.ok(Math.abs(Math.abs(state.ball.dx) - 2 * RULES.rallySpeedUp) < 1e-9);
});

test('the cap still holds, however long the rally runs', () => {
  // Without this the twentieth return is unplayable rather than hard.
  const state = createState();
  for (let i = 0; i < 60; i += 1) {
    const side = i % 2 === 0 ? 'left' : 'right';
    const paddle = state.paddles[side];
    state.ball.x = side === 'left' ? paddle.x + paddle.width : paddle.x;
    state.ball.y = paddle.y + paddle.height / 2;
    state.ball.dx = side === 'left' ? -Math.abs(state.ball.dx) : Math.abs(state.ball.dx);
    bounceOffPaddle(state, side);
    assert.ok(
      speedOf(state.ball) <= RULES.maxSpeed + 1e-9,
      `return ${i} reached ${speedOf(state.ball)}`,
    );
  }
});

/* -------------------------------------------------- the horizontal floor -- */

test('a ball barely moving sideways is pushed back across the field', () => {
  const ball = { dx: 0.2, dy: 7 };
  keepMovingAcross(ball);
  assert.ok(Math.abs(ball.dx) >= RULES.minHorizontalSpeed, `dx is still ${ball.dx}`);
});

test('the direction it was heading is kept', () => {
  const left = { dx: -0.1, dy: 7 };
  keepMovingAcross(left);
  assert.ok(left.dx < 0, 'the ball turned around');

  const right = { dx: 0.1, dy: -7 };
  keepMovingAcross(right);
  assert.ok(right.dx > 0, 'the ball turned around');
  assert.ok(right.dy < 0, 'the vertical direction flipped');
});

test('speed is traded, not added', () => {
  // The cap has just decided the total. Adding horizontal speed on top would
  // undo that decision, one return at a time.
  const ball = { dx: 0.3, dy: 7.9 };
  const before = speedOf(ball);
  keepMovingAcross(ball);
  assert.ok(Math.abs(speedOf(ball) - before) < 1e-9, `${speedOf(ball)} vs ${before}`);
});

test('a ball already crossing briskly is left alone', () => {
  const ball = { dx: 5, dy: 2 };
  keepMovingAcross(ball);
  assert.deepEqual(ball, { dx: 5, dy: 2 });
});

test('a ball slower overall than the floor is not sped up to reach it', () => {
  const ball = { dx: 0.5, dy: 0.5 };
  const before = speedOf(ball);
  keepMovingAcross(ball);
  assert.ok(speedOf(ball) <= before + 1e-9, `${speedOf(ball)} is faster than ${before}`);
});

test('a long rally never stops crossing the field', () => {
  // The regression this exists for: sixty returns of spin and speed-up used
  // to leave the ball drifting up and down with almost no dx at all.
  const state = createState();
  for (let i = 0; i < 60; i += 1) {
    const side = i % 2 === 0 ? 'left' : 'right';
    const paddle = state.paddles[side];
    state.ball.x = side === 'left' ? paddle.x + paddle.width : paddle.x;
    // Always off-centre, so every return adds spin.
    state.ball.y = paddle.y + paddle.height * 0.95;
    state.ball.dx = side === 'left' ? -Math.abs(state.ball.dx) : Math.abs(state.ball.dx);
    bounceOffPaddle(state, side);
    assert.ok(
      Math.abs(state.ball.dx) >= RULES.minHorizontalSpeed - 1e-9,
      `return ${i} left dx at ${state.ball.dx}`,
    );
  }
});
