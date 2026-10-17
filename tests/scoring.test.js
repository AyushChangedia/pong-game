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
  return { state, scorer: E.stepBall(state, fixed(0.5)).scorer };
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
  assert.equal(E.stepBall(state, fixed(0.5)).scorer, null);
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

/* ------------------------------------------------------- who receives -- */

test('the side that conceded receives the next serve', () => {
  // As every racket sport does it, and for the reason they do: losing three
  // points in a row should not also mean watching three serves fly away.
  const state = E.createState();
  state.ball.x = state.field.width + state.ball.size + 1;
  state.ball.dx = 5;

  const { scorer } = E.stepBall(state, fixed(0.9));

  // The player scored, so the computer conceded — and the computer is on the
  // right, so the ball travels right, towards it.
  assert.equal(scorer, 'player');
  assert.ok(state.ball.dx > 0, `the ball went back to the scorer: dx ${state.ball.dx}`);
});

test('and the other way round', () => {
  const state = E.createState();
  state.ball.x = -state.ball.size - 1;
  state.ball.dx = -5;

  const { scorer } = E.stepBall(state, fixed(0.1));

  assert.equal(scorer, 'computer');
  assert.ok(state.ball.dx < 0, `the ball went back to the scorer: dx ${state.ball.dx}`);
});

test('the receiver beats the coin flip', () => {
  // The direction must not depend on the random draw at all once somebody has
  // conceded, or the fairness is only two-thirds of the time.
  for (const draw of [0, 0.1, 0.5, 0.51, 0.9, 0.999]) {
    const state = E.createState();
    state.ball.x = state.field.width + state.ball.size + 1;
    state.ball.dx = 5;
    E.stepBall(state, fixed(draw));
    assert.ok(state.ball.dx > 0, `a draw of ${draw} sent the ball the wrong way`);
  }
});

test('the opening serve is still a coin flip', () => {
  // Nobody has conceded anything yet, so neither side is owed the ball.
  const left = E.createState();
  E.serve(left, fixed(0.2));
  assert.ok(left.ball.dx < 0);

  const right = E.createState();
  E.serve(right, fixed(0.8));
  assert.ok(right.ball.dx > 0);
});

test('a serve to a named side always has real horizontal speed', () => {
  for (const towards of ['player', 'computer']) {
    const state = E.createState();
    E.serve(state, fixed(0.5), towards);
    assert.equal(Math.abs(state.ball.dx), E.RULES.serveSpeed, `serving to ${towards}`);
  }
});

test('the final point does not serve again, whoever conceded', () => {
  const state = E.createState();
  state.score.player = E.RULES.winScore - 1;
  state.ball.x = state.field.width + state.ball.size + 1;
  state.ball.dx = 5;

  E.stepBall(state, fixed(0.5));

  assert.equal(state.gameOver, true);
  assert.ok(state.ball.x > state.field.width, 'the ball was re-centred after match point');
});

/* ------------------------------------------------------- what a step says -- */

test('a step reports a paddle bounce, not just a point', () => {
  // The return used to be the scorer or null, which described the rarest
  // event in the game and none of the common ones. A step that bounced off a
  // paddle looked, from outside, exactly like one where the ball just moved.
  const state = E.createState();
  const paddle = state.paddles.left;
  state.ball.x = paddle.x + paddle.width + state.ball.size - 1;
  state.ball.y = paddle.y + paddle.height / 2;
  state.ball.dx = -1;
  state.ball.dy = 0;

  const events = E.stepBall(state, fixed(0.5));

  assert.equal(events.hitPaddle, 'left');
  assert.equal(events.scorer, null);
  assert.equal(events.hitWall, false);
});

test('a step reports which paddle', () => {
  const state = E.createState();
  const paddle = state.paddles.right;
  state.ball.x = paddle.x - state.ball.size + 1;
  state.ball.y = paddle.y + paddle.height / 2;
  state.ball.dx = 1;
  state.ball.dy = 0;

  assert.equal(E.stepBall(state, fixed(0.5)).hitPaddle, 'right');
});

test('a step reports a wall bounce', () => {
  const state = E.createState();
  state.ball.x = 400;
  state.ball.y = state.ball.size + 1;
  state.ball.dx = 0;
  state.ball.dy = -5;

  const events = E.stepBall(state, fixed(0.5));

  assert.equal(events.hitWall, true);
  assert.equal(events.hitPaddle, null);
});

test('an ordinary step reports nothing at all', () => {
  const state = E.createState();
  state.ball.x = 400;
  state.ball.y = 200;
  state.ball.dx = 2;
  state.ball.dy = 1;

  assert.deepEqual(E.stepBall(state, fixed(0.5)), {
    scorer: null,
    hitPaddle: null,
    hitWall: false,
  });
});

test('a step spent waiting to serve reports nothing, not undefined', () => {
  // The caller reads three fields off this on every frame; handing back a
  // bare null during the serve pause would throw sixty times a second.
  const state = E.createState();
  E.serve(state, fixed(0.5), null, 10);

  const events = E.stepBall(state, fixed(0.5));

  assert.deepEqual(events, { scorer: null, hitPaddle: null, hitWall: false });
});

test('one bounce is reported per step, not two', () => {
  // The ball cannot be on both paddles at once, and reporting the second
  // would play two sounds for one hit.
  const state = E.createState();
  state.paddles.left.x = 390;
  state.paddles.right.x = 400;
  state.ball.x = 400;
  state.ball.y = 200;
  state.paddles.left.y = 150;
  state.paddles.right.y = 150;
  state.ball.dx = -1;

  const events = E.stepBall(state, fixed(0.5));
  assert.ok(events.hitPaddle === 'left' || events.hitPaddle === 'right');
});
