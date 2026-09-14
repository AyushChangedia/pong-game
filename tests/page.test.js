/**
 * page.test.js — the two scripts, loaded the way index.html loads them.
 *
 * Everything else here tests the engine, which never touches the DOM. This
 * tests the seam: that game.js and engine.js can actually sit in the same
 * page together, that the loop drives the match, and that the score ends up
 * in the elements the markup provides.
 *
 * It exists because the seam broke once already and broke completely. Two
 * plain <script> tags share one global lexical scope, so a function declared
 * in one and destructured into a const in the other is a redeclaration: the
 * page died on a SyntaxError before it drew a frame. Sixty-three passing unit
 * tests had nothing to say about it.
 *
 * The DOM here is a stub, not a browser — enough canvas to record that
 * drawing was attempted, and a clock the test advances by hand.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const FRAME_MS = 1000 / 60;

/** A page with the two scripts in it, and the handles to poke at it. */
function loadPage() {
  const drawn = [];
  const ctx = new Proxy(
    {},
    {
      get: (_t, key) => (typeof key === 'string' ? (...args) => drawn.push([key, args]) : undefined),
      set: () => true,
    },
  );

  const canvas = {
    width: 800,
    height: 400,
    getContext: () => ctx,
    getBoundingClientRect: () => ({ top: 0, left: 0, height: 400, width: 800 }),
  };

  const elements = {
    gameCanvas: canvas,
    playerScore: { textContent: '' },
    computerScore: { textContent: '' },
  };

  const listeners = {};
  let pending = null;

  const sandbox = {
    window: {},
    document: {
      getElementById: (id) => elements[id],
      addEventListener: (type, fn) => {
        (listeners[type] || (listeners[type] = [])).push(fn);
      },
    },
    requestAnimationFrame: (fn) => {
      pending = fn;
    },
    Math,
    Number,
    Boolean,
    String,
    Object,
    console,
  };

  vm.createContext(sandbox);
  for (const file of ['engine.js', 'game.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox, { filename: file });
  }

  let clock = 0;
  const page = {
    sandbox,
    elements,
    drawn,
    listeners,
    /** Run `count` animation frames, each one frame of wall clock apart. */
    frames(count, frameMs = FRAME_MS) {
      for (let i = 0; i < count && pending; i += 1) {
        const fn = pending;
        pending = null;
        clock += frameMs;
        fn(clock);
      }
      return page;
    },
    fire(type, event) {
      for (const fn of listeners[type] || []) fn(event);
      return page;
    },
  };

  return page;
}

const press = (key) => ({ key, preventDefault() {} });

/* ------------------------------------------------------------- the seam -- */

test('both scripts load into one page without colliding', () => {
  // The regression, and the reason this file exists at all.
  assert.doesNotThrow(loadPage);
});

test('index.html loads the engine before the game that reads it', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  // The src attributes only. A comment mentioning game.js is not a load order.
  const loaded = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(loaded.includes('engine.js'), 'index.html does not load engine.js at all');
  assert.ok(loaded.includes('game.js'), 'index.html does not load game.js at all');
  assert.ok(
    loaded.indexOf('engine.js') < loaded.indexOf('game.js'),
    `game.js runs before window.ENGINE exists: ${loaded.join(', ')}`,
  );
});

test('only the engine is published to the window', () => {
  const { sandbox } = loadPage();
  assert.equal(typeof sandbox.window.ENGINE, 'object');
  assert.deepEqual(Object.keys(sandbox.window), ['ENGINE']);
});

/* ------------------------------------------------------------- the loop -- */

test('the first frame draws something', () => {
  const page = loadPage().frames(1);
  assert.ok(page.drawn.length > 0, 'nothing was drawn');
});

test('the loop keeps asking for frames', () => {
  const page = loadPage().frames(120);
  assert.ok(page.drawn.length > 100, 'the loop stopped');
});

test('a match plays itself out and stops at the win score', () => {
  const page = loadPage().frames(20_000);
  const { playerScore, computerScore } = page.elements;
  const top = Math.max(Number(playerScore.textContent), Number(computerScore.textContent));
  assert.equal(top, 5, `the match ended at ${top}`);
});

test('the score reaches the elements the markup provides', () => {
  const page = loadPage().frames(600);
  assert.notEqual(page.elements.playerScore.textContent, '');
  assert.notEqual(page.elements.computerScore.textContent, '');
});

test('frames still draw once the match is over', () => {
  // The result screen is drawn, not frozen on the last frame of play.
  const page = loadPage().frames(20_000);
  const before = page.drawn.length;
  page.frames(10);
  assert.ok(page.drawn.length > before, 'the loop stopped when the match ended');
});

/* ------------------------------------------------------------ the input -- */

/** Where the player's paddle was on the last frame that drew it. */
function playerPaddleY(page) {
  const fills = page.drawn.filter(
    ([key, args]) => key === 'fillRect' && args.length === 4 && args[0] === 10 && args[2] === 15,
  );
  assert.ok(fills.length > 0, 'the player paddle was never drawn');
  return fills[fills.length - 1][1][1];
}

test('an arrow key moves the paddle', () => {
  const page = loadPage().frames(1);
  const before = playerPaddleY(page);

  page.fire('keydown', press('ArrowUp'));
  page.frames(30);
  assert.ok(playerPaddleY(page) < before, 'the paddle did not move up');

  page.fire('keyup', press('ArrowUp'));
  const held = playerPaddleY(page);
  page.frames(30);
  assert.equal(playerPaddleY(page), held, 'the paddle kept moving after the key was released');
});

test('a pointer move is accepted in buffer coordinates', () => {
  const page = loadPage();
  assert.doesNotThrow(() => page.fire('mousemove', { clientY: 300 }));
  page.frames(30);
});

test('space restarts a finished match', () => {
  const page = loadPage().frames(20_000);
  page.fire('keydown', press(' '));
  page.frames(1);
  assert.equal(page.elements.playerScore.textContent, 0);
  assert.equal(page.elements.computerScore.textContent, 0);
});

test('space does nothing while a match is still being played', () => {
  const page = loadPage().frames(600);
  const total = () =>
    Number(page.elements.playerScore.textContent) + Number(page.elements.computerScore.textContent);
  assert.ok(total() > 0, 'no point was scored in ten seconds, so this proves nothing');

  page.fire('keydown', press(' '));
  page.frames(1);
  assert.ok(total() > 0, 'space wiped the score mid-match');
});
