/**
 * Scoring, serving and the end of a match.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const E = require('../engine.js');

const fixed = (value) => () => value;

/** Run the ball past one edge and return who scored. */
function concede(side) {
  const state = E.createState();
  state.ball.y = 380;                       // clear of both paddles
  state.paddles.left.y = 0;
  state.paddles.right.y = 0;
  state.ball.x = side === 'left' ? 5 : state.field.width - 5;
  state.ball.dx = side === 'left' ? -30 : 30;
  state.ball.dy = 0;
  return { state, scorer: E.stepBall(state, fixed(0.5)) };
}

test('the ball leaving the left edge is a point for the computer', () => {
  const { state, scorer } = concede('left');
  assert.equal(scorer, 'computer');
  assert.equal(state.score.computer, 1);
  assert.equal(state.score.player, 0);
});

test('the ball leaving the right edge is a point for the player', () => {
  const { state, scorer } = concede('right');
  assert.equal(scorer, 'player');
  assert.equal(state.score.player, 1);
});

test('an ordinary step scores nothing', () => {
  const state = E.createState();
  state.ball.x = 400;
  assert.equal(E.stepBall(state, fixed(0.5)), null);
  assert.deepEqual(state.score, { player: 0, computer: 0 });
});

test('a point puts the ball back in the middle', () => {
  const { state } = concede('left');
  assert.equal(state.ball.x, state.field.width / 2);
  assert.equal(state.ball.y, state.field.height / 2);
});

test('the serve alternates side with the coin flip, not always the same way', () => {
  const left = E.serve(E.createState(), fixed(0.9));
  const right = E.serve(E.createState(), fixed(0.1));
  assert.ok(left.ball.dx > 0);
  assert.ok(right.ball.dx < 0);
});

test('a serve always has real horizontal speed', () => {
  // A ball served with dx near zero drifts vertically and the rally never
  // starts, which reads as the game having frozen.
  for (let i = 0; i < 200; i += 1) {
    const state = E.serve(E.createState(), Math.random);
    assert.ok(Math.abs(state.ball.dx) >= E.RULES.serveSpeed - 1e-9, `dx was ${state.ball.dx}`);
  }
});

test('reaching the winning score ends the match', () => {
  const state = E.createState();
  state.score.player = E.RULES.winScore - 1;
  state.ball.y = 380;
  state.paddles.right.y = 0;
  state.ball.x = state.field.width - 5;
  state.ball.dx = 30;
  E.stepBall(state, fixed(0.5));
  assert.equal(state.gameOver, true);
  assert.equal(E.winner(state), 'player');
});

test('the match is not over one point short', () => {
  const state = E.createState();
  state.score.player = E.RULES.winScore - 1;
  assert.equal(state.gameOver, false);
  assert.equal(E.winner(state), null);
});

test('winner and gameOver never disagree', () => {
  // Two sources of truth for "the match is over" is how a game shows YOU WIN
  // while the ball is still moving underneath it.
  const state = E.createState();
  state.ball.y = 380;
  state.paddles.right.y = 0;
  for (let point = 0; point < E.RULES.winScore; point += 1) {
    state.ball.x = state.field.width - 5;
    state.ball.dx = 30;
    state.ball.dy = 0;
    E.stepBall(state, fixed(0.5));
    assert.equal(state.gameOver, E.winner(state) !== null, `after ${point + 1} points`);
  }
});

test('the final point does not also serve a new ball', () => {
  // Serving after the winning point leaves a ball moving behind the GAME OVER
  // overlay, so unpausing lands you mid-rally.
  const state = E.createState();
  state.score.player = E.RULES.winScore - 1;
  state.ball.y = 380;
  state.paddles.right.y = 0;
  state.ball.x = state.field.width - 5;
  state.ball.dx = 30;
  E.stepBall(state, fixed(0.5));
  assert.notEqual(state.ball.x, state.field.width / 2, 'the ball was re-served after the win');
});

test('resetting a match clears the score and re-centres everything', () => {
  const state = E.createState();
  state.score.player = 3;
  state.score.computer = 5;
  state.gameOver = true;
  state.paddles.left.y = 0;
  state.paddles.right.y = 300;

  E.resetMatch(state, fixed(0.5));

  assert.deepEqual(state.score, { player: 0, computer: 0 });
  assert.equal(state.gameOver, false);
  assert.equal(state.paddles.left.y, state.field.height / 2 - E.RULES.paddleHeight / 2);
  assert.equal(state.paddles.right.y, state.field.height / 2 - E.RULES.paddleHeight / 2);
  assert.equal(state.ball.x, state.field.width / 2);
});

test('a full match ends at the winning score and no further', () => {
  const state = E.createState();
  for (let i = 0; i < 20000 && !state.gameOver; i += 1) {
    E.updateAI(state);
    E.stepBall(state, Math.random);
  }
  assert.equal(state.gameOver, true, 'no match completed in 20000 steps');
  assert.equal(Math.max(state.score.player, state.score.computer), E.RULES.winScore);
});
