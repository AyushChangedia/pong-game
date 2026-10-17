/**
 * difficulty.test.js — how good the computer is, and in what way.
 *
 * Speed alone is a poor difficulty knob. A paddle that reads the ball
 * perfectly and simply moves slowly is not an easier opponent so much as a
 * differently-shaped wall: it never misjudges anything, so the only way past
 * it is to out-run it. These levels differ in how well the computer reads the
 * ball as well as how fast it can act.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const E = require('../engine.js');
const { DIFFICULTY, DEFAULT_DIFFICULTY, createState, difficultyOf, setDifficulty, updateAI } = E;

const NAMES = Object.keys(DIFFICULTY);

/* -------------------------------------------------------------- the set -- */

test('there are three levels and the default is one of them', () => {
  assert.deepEqual(NAMES, ['easy', 'normal', 'hard']);
  assert.ok(DIFFICULTY[DEFAULT_DIFFICULTY], `${DEFAULT_DIFFICULTY} is not a level`);
});

test('every level is fully specified', () => {
  for (const [name, level] of Object.entries(DIFFICULTY)) {
    assert.ok(level.speed > 0, `${name} cannot move`);
    assert.ok(level.aim >= 0, `${name} has a negative misjudgement`);
    assert.ok(level.reach > 0 && level.reach <= 1, `${name} reaches ${level.reach}`);
  }
});

test('the levels get harder in every dimension at once', () => {
  // A level that is faster but blinder is not harder, it is just different.
  assert.ok(DIFFICULTY.easy.speed < DIFFICULTY.normal.speed);
  assert.ok(DIFFICULTY.normal.speed < DIFFICULTY.hard.speed);
  assert.ok(DIFFICULTY.easy.aim > DIFFICULTY.normal.aim);
  assert.ok(DIFFICULTY.normal.aim > DIFFICULTY.hard.aim);
  assert.ok(DIFFICULTY.easy.reach < DIFFICULTY.normal.reach);
  assert.ok(DIFFICULTY.normal.reach < DIFFICULTY.hard.reach);
});

test('hard reads the ball exactly and watches the whole field', () => {
  assert.equal(DIFFICULTY.hard.aim, 0);
  assert.equal(DIFFICULTY.hard.reach, 1);
});

/* ---------------------------------------------------------- choosing one -- */

test('a new match is on the default', () => {
  assert.equal(createState().difficulty, DEFAULT_DIFFICULTY);
});

test('a level can be chosen by name', () => {
  const state = createState();
  for (const name of NAMES) {
    assert.equal(setDifficulty(state, name), name);
    assert.equal(state.difficulty, name);
  }
});

test('an unknown name falls back rather than breaking the computer', () => {
  // The name comes from a dropdown, and a dropdown can be edited. An
  // unrecognised level that left the AI with no speed would leave the right
  // paddle standing still, which looks like a bug in the game.
  const state = createState();
  for (const bad of ['impossible', '', null, undefined, 42, {}]) {
    assert.equal(setDifficulty(state, bad), DEFAULT_DIFFICULTY, `${String(bad)} was accepted`);
  }
});

test('difficultyOf never returns nothing', () => {
  for (const bad of ['nope', '', null, undefined]) {
    const level = difficultyOf(bad);
    assert.ok(level && level.speed > 0, `${String(bad)} gave ${JSON.stringify(level)}`);
  }
});

/* ------------------------------------------------------------- behaviour -- */

/** Put the ball at a given place and let the computer react once. */
function reactTo(difficulty, { x, y }) {
  const state = createState();
  setDifficulty(state, difficulty);
  state.ball.x = x;
  state.ball.y = y;
  const before = state.paddles.right.y;
  updateAI(state);
  return state.paddles.right.y - before;
}

test('each level moves at its own speed', () => {
  // Ball low and close, so every level is paying attention and all of them
  // want to move the same way.
  for (const name of NAMES) {
    const moved = reactTo(name, { x: 700, y: 395 });
    assert.equal(moved, DIFFICULTY[name].speed, `${name} moved ${moved}`);
  }
});

test('an easy computer ignores a ball still on the far side', () => {
  // Which is what makes it beatable by a shot played early rather than only
  // by a fast one.
  assert.equal(reactTo('easy', { x: 40, y: 395 }), 0);
});

test('a hard computer is already moving while the ball is on the far side', () => {
  assert.ok(reactTo('hard', { x: 40, y: 395 }) > 0);
});

test('an easy computer misjudges away from the middle', () => {
  // The offset leans towards the nearer edge, so the gap it leaves is on the
  // side the ball came from — the shot that beats it is the one across it.
  const state = createState();
  setDifficulty(state, 'easy');
  state.ball.x = 700;
  state.ball.y = 100; // above the middle

  for (let i = 0; i < 200; i += 1) updateAI(state);

  const centre = state.paddles.right.y + state.paddles.right.height / 2;
  assert.ok(centre < 100, `the paddle settled at ${centre}, not above the ball`);
});

test('a hard computer settles on the ball itself', () => {
  const state = createState();
  setDifficulty(state, 'hard');
  state.ball.x = 700;
  state.ball.y = 100;

  for (let i = 0; i < 200; i += 1) updateAI(state);

  const centre = state.paddles.right.y + state.paddles.right.height / 2;
  assert.ok(Math.abs(centre - 100) <= E.RULES.deadZone + DIFFICULTY.hard.speed, `settled at ${centre}`);
});

test('no level can push the paddle off the field', () => {
  for (const name of NAMES) {
    const state = createState();
    setDifficulty(state, name);
    state.ball.x = 799;
    for (const y of [-5000, 5000]) {
      state.ball.y = y;
      for (let i = 0; i < 300; i += 1) updateAI(state);
      const paddle = state.paddles.right;
      assert.ok(paddle.y >= 0, `${name} left the top at ${paddle.y}`);
      assert.ok(
        paddle.y + paddle.height <= state.field.height,
        `${name} left the bottom at ${paddle.y}`,
      );
    }
  }
});
