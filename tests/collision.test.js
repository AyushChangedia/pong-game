/**
 * Bouncing.
 *
 * The collision is where a game feels wrong rather than looks wrong, so it is
 * the part worth pinning. A ball that sticks, jitters, or passes through a
 * paddle is not an error anywhere — it is just a rally that went oddly.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const E = require('../engine.js');

/** A state with the ball placed exactly where a test wants it. */
function at(ball = {}, paddles = {}) {
  const state = E.createState();
  Object.assign(state.ball, ball);
  if (paddles.left) Object.assign(state.paddles.left, paddles.left);
  if (paddles.right) Object.assign(state.paddles.right, paddles.right);
  return state;
}

/** Put the ball in the middle of a paddle's face. */
function touching(state, side) {
  const paddle = state.paddles[side];
  state.ball.y = paddle.y + paddle.height / 2;
  state.ball.x = side === 'left'
    ? paddle.x + paddle.width
    : paddle.x;
  return state;
}

/* ------------------------------------------------------------- overlap -- */

test('overlap is true only when the two actually intersect', () => {
  const state = E.createState();
  const paddle = state.paddles.left;
  assert.ok(E.overlaps({ x: paddle.x + 5, y: paddle.y + 10, size: 10 }, paddle));
  assert.ok(!E.overlaps({ x: 400, y: 200, size: 10 }, paddle), 'mid-field');
  assert.ok(!E.overlaps({ x: paddle.x + 5, y: paddle.y - 50, size: 10 }, paddle), 'above it');
});

/* -------------------------------------------------------------- bounce -- */

test('a ball arriving at the left paddle leaves going right', () => {
  const state = touching(at({ dx: -5, dy: 0 }), 'left');
  assert.equal(E.bounceOffPaddle(state, 'left'), true);
  assert.ok(state.ball.dx > 0, `dx was ${state.ball.dx}`);
});

test('a ball arriving at the right paddle leaves going left', () => {
  const state = touching(at({ dx: 5, dy: 0 }), 'right');
  assert.equal(E.bounceOffPaddle(state, 'right'), true);
  assert.ok(state.ball.dx < 0, `dx was ${state.ball.dx}`);
});

test('a bounce always sends the ball away from the paddle it hit', () => {
  // The bug this pins: flipping the sign means a ball that is already moving
  // away gets turned back into the paddle, and then bounces out again next
  // frame — a ball welded to the paddle face, jittering.
  for (const dx of [-5, -1, 1, 5]) {
    const left = touching(at({ dx, dy: 0 }), 'left');
    E.bounceOffPaddle(left, 'left');
    assert.ok(left.ball.dx > 0, `left paddle, entering dx ${dx}, left with ${left.ball.dx}`);

    const right = touching(at({ dx, dy: 0 }), 'right');
    E.bounceOffPaddle(right, 'right');
    assert.ok(right.ball.dx < 0, `right paddle, entering dx ${dx}, left with ${right.ball.dx}`);
  }
});

test('the ball is pushed clear, so the next frame is not another collision', () => {
  const state = touching(at({ dx: -5, dy: 0 }), 'left');
  E.bounceOffPaddle(state, 'left');
  assert.ok(!E.overlaps(state.ball, state.paddles.left), 'still overlapping after the bounce');
});

test('a ball nowhere near a paddle does not bounce', () => {
  const state = at({ x: 400, y: 200, dx: 5, dy: 0 });
  assert.equal(E.bounceOffPaddle(state, 'left'), false);
  assert.equal(state.ball.dx, 5, 'nothing should have changed');
});

/* ---------------------------------------------------------------- spin -- */

test('hitting above centre sends the ball upwards', () => {
  const state = at({ dx: -5, dy: 0 });
  const paddle = state.paddles.left;
  state.ball.x = paddle.x + paddle.width;
  state.ball.y = paddle.y + 5; // near the top edge
  E.bounceOffPaddle(state, 'left');
  assert.ok(state.ball.dy < 0, `dy was ${state.ball.dy}`);
});

test('hitting below centre sends the ball downwards', () => {
  const state = at({ dx: -5, dy: 0 });
  const paddle = state.paddles.left;
  state.ball.x = paddle.x + paddle.width;
  state.ball.y = paddle.y + paddle.height - 5;
  E.bounceOffPaddle(state, 'left');
  assert.ok(state.ball.dy > 0, `dy was ${state.ball.dy}`);
});

test('hitting dead centre leaves the vertical direction alone', () => {
  const state = touching(at({ dx: -5, dy: 2 }), 'left');
  E.bounceOffPaddle(state, 'left');
  assert.ok(Math.abs(state.ball.dy - 2) < 1e-9, `dy became ${state.ball.dy}`);
});

/* --------------------------------------------------------------- speed -- */

test('the speed cap holds after a bounce, not just in the loop', () => {
  // Spin is added at the bounce, so the cap has to be applied there too.
  const state = touching(at({ dx: -8, dy: 8 }), 'left');
  E.bounceOffPaddle(state, 'left');
  assert.ok(Math.hypot(state.ball.dx, state.ball.dy) <= E.RULES.maxSpeed + 1e-9);
});

test('capping the speed keeps the direction it was going', () => {
  const ball = { dx: 30, dy: 40 };
  const beforeAngle = Math.atan2(ball.dy, ball.dx);
  E.capSpeed(ball);
  assert.ok(Math.abs(Math.atan2(ball.dy, ball.dx) - beforeAngle) < 1e-9);
  assert.ok(Math.abs(Math.hypot(ball.dx, ball.dy) - E.RULES.maxSpeed) < 1e-9);
});

test('a slow ball is left alone by the cap', () => {
  const ball = { dx: 1, dy: 1 };
  E.capSpeed(ball);
  assert.deepEqual(ball, { dx: 1, dy: 1 });
});

/* --------------------------------------------------------------- walls -- */

test('the ball bounces off the top and comes back down', () => {
  const state = at({ x: 400, y: 5, dx: 3, dy: -5 });
  E.stepBall(state, () => 0.5);
  assert.ok(state.ball.dy > 0, `dy was ${state.ball.dy}`);
});

test('the ball bounces off the floor and comes back up', () => {
  const state = at({ x: 400, y: 395, dx: 3, dy: 5 });
  E.stepBall(state, () => 0.5);
  assert.ok(state.ball.dy < 0, `dy was ${state.ball.dy}`);
});

test('the ball never ends a step outside the field vertically', () => {
  // Flipping dy without also pulling the ball back inside leaves it stuck
  // outside the wall, flipping every frame.
  const state = at({ x: 400, y: 200, dx: 0, dy: 7 });
  for (let i = 0; i < 400; i += 1) {
    E.stepBall(state, () => 0.5);
    assert.ok(
      state.ball.y >= state.ball.size && state.ball.y <= state.field.height - state.ball.size,
      `escaped at y=${state.ball.y} on step ${i}`,
    );
  }
});
