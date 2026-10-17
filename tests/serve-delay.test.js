/**
 * serve-delay.test.js — the beat between a point and the next one.
 *
 * A point used to end and the next one begin in the same frame. The ball
 * vanished off one edge and was already travelling from the middle before
 * anyone had registered the first thing, which is the difference between a
 * rally ending and a rally being interrupted.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const E = require('../engine.js');
const { RULES, createState, serve, stepBall, resetMatch } = E;

const fixed = (value) => () => value;

/** Put the ball just past the right edge, so the next step scores. */
function aboutToScore(state) {
  state.ball.x = state.field.width + state.ball.size + 1;
  state.ball.dx = 5;
  return state;
}

test('a point starts the wait', () => {
  const state = aboutToScore(createState());
  stepBall(state, fixed(0.5));
  assert.equal(state.serveWait, RULES.serveDelaySteps);
});

test('the ball sits still while it waits', () => {
  const state = aboutToScore(createState());
  stepBall(state, fixed(0.5));

  const resting = { ...state.ball };
  for (let i = 0; i < 10; i += 1) stepBall(state, fixed(0.5));

  assert.equal(state.ball.x, resting.x);
  assert.equal(state.ball.y, resting.y);
});

test('it waits at the centre line, pointed where it is going', () => {
  const state = aboutToScore(createState());
  stepBall(state, fixed(0.5));

  assert.equal(state.ball.x, state.field.width / 2);
  assert.equal(state.ball.y, state.field.height / 2);
  assert.ok(state.ball.dx !== 0, 'the waiting ball has no direction yet');
});

test('the wait counts down one step at a time', () => {
  const state = aboutToScore(createState());
  stepBall(state, fixed(0.5));

  stepBall(state, fixed(0.5));
  assert.equal(state.serveWait, RULES.serveDelaySteps - 1);

  stepBall(state, fixed(0.5));
  assert.equal(state.serveWait, RULES.serveDelaySteps - 2);
});

test('the ball goes once the wait is over', () => {
  const state = aboutToScore(createState());
  stepBall(state, fixed(0.5));

  for (let i = 0; i < RULES.serveDelaySteps; i += 1) stepBall(state, fixed(0.5));
  assert.equal(state.serveWait, 0);

  const before = state.ball.x;
  stepBall(state, fixed(0.5));
  assert.notEqual(state.ball.x, before, 'the ball never left the centre line');
});

test('nothing can be scored while the ball is waiting', () => {
  // It is sitting on the centre line, so it cannot be — but a step that moved
  // it first and checked afterwards would have scored on the frame the point
  // was already awarded.
  const state = aboutToScore(createState());
  stepBall(state, fixed(0.5));

  for (let i = 0; i < RULES.serveDelaySteps; i += 1) {
    assert.equal(stepBall(state, fixed(0.5)), null, `a point was scored at step ${i}`);
  }
  assert.equal(state.score.player + state.score.computer, 1);
});

test('a waiting ball cannot bounce off a paddle either', () => {
  const state = aboutToScore(createState());
  stepBall(state, fixed(0.5));

  // Park a paddle on top of the resting ball. Nothing should happen.
  state.paddles.left.x = state.ball.x - state.paddles.left.width / 2;
  state.paddles.left.y = state.ball.y - state.paddles.left.height / 2;

  const before = { ...state.ball };
  stepBall(state, fixed(0.5));
  assert.deepEqual(state.ball, before);
  assert.equal(state.rally, 0);
});

test('a new match waits before its opening serve too', () => {
  const state = createState();
  resetMatch(state, fixed(0.5));
  assert.equal(state.serveWait, RULES.serveDelaySteps);
});

test('a serve with no delay named goes immediately', () => {
  // The engine's own default, used by the tests that are about the ball
  // rather than about the pause before it.
  const state = createState();
  serve(state, fixed(0.5));
  assert.equal(state.serveWait, 0);
});

test('a nonsense delay is treated as none rather than as forever', () => {
  for (const bad of [NaN, undefined, null, -5, 'soon']) {
    const state = createState();
    serve(state, fixed(0.5), null, bad);
    assert.equal(state.serveWait, 0, `a delay of ${String(bad)} stuck`);
  }
});

test('the match still finishes, delays and all', () => {
  const state = createState();
  const input = { pointer: true, pointerY: state.field.height / 2 };

  for (let i = 0; i < 60_000 && !state.gameOver; i += 1) {
    E.updatePlayer(state, input);
    E.updateAI(state);
    stepBall(state);
  }

  assert.equal(state.gameOver, true, 'the match never ended');
});

test('the final point does not start a wait nobody is waiting for', () => {
  const state = createState();
  state.score.player = RULES.winScore - 1;
  aboutToScore(state);

  stepBall(state, fixed(0.5));

  assert.equal(state.gameOver, true);
  assert.equal(state.serveWait, 0);
});
