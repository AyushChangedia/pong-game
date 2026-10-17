/**
 * pause.test.js — stopping the match without losing it.
 *
 * Pausing is not the same as the match being over, and the difference is worth
 * stating: a finished match stays finished, while a paused one is waiting for
 * someone to come back to it. Both still draw, because the pause overlay and
 * the result screen are both things to look at — so the flag that gates the
 * simulation is deliberately not the flag that gates rendering.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createState,
  isRunning,
  setPaused,
  togglePause,
  resetMatch,
  RULES,
} = require('../engine.js');

const finished = () => {
  const state = createState();
  state.score.player = RULES.winScore;
  state.gameOver = true;
  return state;
};

test('a new match is running and not paused', () => {
  const state = createState();
  assert.equal(state.paused, false);
  assert.equal(isRunning(state), true);
});

test('pausing stops the simulation', () => {
  const state = createState();
  setPaused(state, true);
  assert.equal(state.paused, true);
  assert.equal(isRunning(state), false);
});

test('resuming starts it again', () => {
  const state = createState();
  setPaused(state, true);
  setPaused(state, false);
  assert.equal(isRunning(state), true);
});

test('toggling flips it either way', () => {
  const state = createState();
  assert.equal(togglePause(state), true);
  assert.equal(togglePause(state), false);
  assert.equal(togglePause(state), true);
});

test('a finished match cannot be paused', () => {
  // The overlay would be drawn over the result, and resuming it would have
  // nothing to resume.
  const state = finished();
  assert.equal(setPaused(state, true), false);
  assert.equal(state.paused, false);
  assert.equal(togglePause(state), false);
});

test('a finished match is not running, paused or otherwise', () => {
  assert.equal(isRunning(finished()), false);
});

test('pausing takes anything truthy, so a key handler can hand it an event', () => {
  const state = createState();
  setPaused(state, 'yes');
  assert.equal(state.paused, true);
  setPaused(state, 0);
  assert.equal(state.paused, false);
});

test('starting a new match clears the pause', () => {
  // Otherwise pressing space on a paused match starts one that is already
  // stopped, and the board sits there doing nothing.
  const state = createState();
  setPaused(state, true);
  resetMatch(state, () => 0.5);
  assert.equal(state.paused, false);
  assert.equal(isRunning(state), true);
});

test('pausing does not touch the score or the ball', () => {
  const state = createState();
  state.score.player = 3;
  const ball = { ...state.ball };

  setPaused(state, true);

  assert.equal(state.score.player, 3);
  assert.deepEqual(state.ball, ball);
});
