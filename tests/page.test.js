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

  const listeners = {};
  const listen = (prefix) => (type, fn, options) => {
    (listeners[prefix + type] || (listeners[prefix + type] = [])).push({ fn, options });
  };

  const canvas = {
    width: 800,
    height: 400,
    getContext: () => ctx,
    getBoundingClientRect: () => ({ top: 0, left: 0, height: 400, width: 800 }),
    addEventListener: listen('canvas:'),
  };

  const mode = {
    value: 'computer',
    blurred: 0,
    blur() {
      mode.blurred += 1;
    },
    addEventListener: (type, fn) => {
      (listeners[`mode:${type}`] || (listeners[`mode:${type}`] = [])).push({ fn });
    },
  };

  const difficulty = {
    value: 'normal',
    disabled: false,
    blurred: 0,
    blur() {
      difficulty.blurred += 1;
    },
    addEventListener: (type, fn) => {
      (listeners[`difficulty:${type}`] || (listeners[`difficulty:${type}`] = [])).push({ fn });
    },
  };

  const elements = {
    gameCanvas: canvas,
    playerScore: { textContent: '' },
    computerScore: { textContent: '' },
    difficulty,
    mode,
  };

  let pending = null;

  const sandbox = {
    window: { addEventListener: listen('window:') },
    document: {
      getElementById: (id) => elements[id],
      addEventListener: listen(''),
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
      for (const { fn } of listeners[type] || []) fn(event);
      return page;
    },
    /** A touch event on the canvas, with the default-prevention recorded. */
    touch(type, clientY) {
      const prevented = [];
      const event = {
        touches: clientY === undefined ? [] : [{ clientY }],
        preventDefault: () => prevented.push(true),
      };
      for (const { fn } of listeners[`canvas:${type}`] || []) fn(event);
      return prevented.length > 0;
    },
    registrations(type) {
      return listeners[type] || [];
    },
    /**
     * Play, tracking the ball with the pointer.
     *
     * The default page leaves the paddle wherever the cursor is resting, so a
     * rally never gets past a return or two. A test about rallies has to
     * actually play one.
     */
    play(count) {
      for (let i = 0; i < count; i += 1) {
        const arcs = page.drawn.filter(([key]) => key === 'arc');
        if (arcs.length) {
          const ballY = arcs[arcs.length - 1][1][1];
          page.fire('mousemove', { clientY: ballY });
        }
        page.frames(1);
      }
      return page;
    },
    /** Switch the right paddle the way a person would. */
    chooseMode(value) {
      mode.value = value;
      for (const { fn } of listeners['mode:change'] || []) fn({});
      return page;
    },
    mode,
    /** Pick a difficulty the way a person would. */
    chooseDifficulty(value) {
      difficulty.value = value;
      for (const { fn } of listeners['difficulty:change'] || []) fn({});
      return page;
    },
    difficulty,
    /** Run `count` frames as if the clock had jumped by `gapMs` first. */
    gap(gapMs, count = 1) {
      clock += gapMs;
      return page.frames(count);
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
  // Everything else the two files declare stays inside their closures, which
  // is what keeps them from colliding in the first place.
  const { sandbox } = loadPage();
  assert.equal(typeof sandbox.window.ENGINE, 'object');
  const added = Object.keys(sandbox.window).filter((key) => key !== 'addEventListener');
  assert.deepEqual(added, ['ENGINE']);
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

/** Where the ball was on the last frame that drew it. */
function ballX(page) {
  const arcs = page.drawn.filter(([key]) => key === 'arc');
  assert.ok(arcs.length > 0, 'the ball was never drawn');
  return arcs[arcs.length - 1][1][0];
}

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

/* ---------------------------------------------------- losing the window -- */

test('a key held when the window loses focus is let go of', () => {
  // The keyup arrives at whatever window is in front, not this one, so the
  // arrow key stays held here. Coming back used to find the paddle sliding
  // into a wall on its own with nobody touching anything.
  const page = loadPage().frames(1);
  page.fire('keydown', press('ArrowUp'));
  page.frames(20);
  page.fire('window:blur', {});

  const parked = playerPaddleY(page);
  page.frames(60);
  assert.equal(playerPaddleY(page), parked, 'the paddle kept moving after focus was lost');
});

test('the same is true when the tab is hidden rather than unfocused', () => {
  const page = loadPage().frames(1);
  page.fire('keydown', press('ArrowDown'));
  page.frames(20);
  page.fire('visibilitychange', {});

  const parked = playerPaddleY(page);
  page.frames(60);
  assert.equal(playerPaddleY(page), parked);
});

test('time spent away is not played out on the first frame back', () => {
  const page = loadPage().frames(60);
  const ballAfter = () => page.drawn.filter(([key]) => key === 'arc').pop()[1][0];

  page.fire('visibilitychange', {});
  const before = ballAfter();
  page.gap(30_000, 1);
  assert.equal(ballAfter(), before, 'the ball moved on the frame that came back');
});

/* ------------------------------------------------------------- the rally -- */

/** Every string the page has drawn so far. */
const textsOn = (page) =>
  page.drawn.filter(([key]) => key === 'fillText').map(([, args]) => String(args[0]));

/** The strings drawn on the most recent frame only. */
function latestTexts(page) {
  const before = page.drawn.length;
  page.frames(1);
  return page.drawn
    .slice(before)
    .filter(([key]) => key === 'fillText')
    .map(([, args]) => String(args[0]));
}

test('a short exchange does not put a counter on the board', () => {
  // A "1" over every serve is noise, and a counter almost always showing its
  // lowest value reads as broken rather than as quiet.
  const page = loadPage().frames(90);
  assert.ok(
    !latestTexts(page).some((t) => t.startsWith('RALLY')),
    'a rally was announced before there was one',
  );
});

test('a real rally is counted on the board', () => {
  const page = loadPage().frames(1).play(1200);
  assert.ok(
    textsOn(page).some((t) => /^RALLY \d+$/.test(t)),
    'no rally was ever shown across a whole match',
  );
});

test('the best rally of the match is kept on screen', () => {
  const page = loadPage().frames(1).play(1500);
  assert.ok(
    textsOn(page).some((t) => /^BEST \d+$/.test(t)),
    'the best rally was never shown',
  );
});

test('the result screen reports the longest rally', () => {
  const page = loadPage().frames(1).play(1500).frames(40_000);
  const texts = latestTexts(page);
  assert.ok(texts.some((t) => /WIN|GAME OVER/.test(t)), texts.join(' | '));
  assert.ok(
    texts.some((t) => /Longest rally: \d+ returns/.test(t)),
    texts.join(' | '),
  );
});

test('a new match starts the counter over', () => {
  const page = loadPage().frames(1).play(1500).frames(40_000);
  page.fire('keydown', press(' '));
  page.frames(1);

  assert.ok(
    !latestTexts(page).some((t) => /^(RALLY|BEST) \d+$/.test(t)),
    'the previous match\'s rally survived into the new one',
  );
});

/* ------------------------------------------------------------ two players -- */

test('W and S move the right paddle in two-player', () => {
  const page = loadPage().frames(1);
  page.chooseMode('human');
  page.frames(1);

  const before = computerPaddleY(page);
  page.fire('keydown', press('w'));
  page.frames(30);
  assert.ok(computerPaddleY(page) < before, 'W did not move the right paddle up');

  page.fire('keyup', press('w'));
  const held = computerPaddleY(page);
  page.frames(30);
  assert.equal(computerPaddleY(page), held, 'the paddle kept moving after W was released');
});

test('S moves it the other way', () => {
  const page = loadPage().frames(1);
  page.chooseMode('human');
  page.frames(1);

  const before = computerPaddleY(page);
  page.fire('keydown', press('s'));
  page.frames(30);
  assert.ok(computerPaddleY(page) > before);
});

test('the case of the key does not matter', () => {
  const page = loadPage().frames(1);
  page.chooseMode('human');
  page.frames(1);

  const before = computerPaddleY(page);
  page.fire('keydown', press('W'));
  page.frames(30);
  assert.ok(computerPaddleY(page) < before, 'a capital W did nothing');
});

test('W does nothing while the computer has the paddle', () => {
  // Otherwise a stray keypress fights the computer for its own paddle. The
  // computer moves on its own, so the test is whether holding W changes
  // anything: the two runs must trace the same path.
  const quiet = loadPage().frames(120);

  const pressed = loadPage().frames(1);
  pressed.fire('keydown', press('w'));
  pressed.frames(119);

  assert.equal(computerPaddleY(pressed), computerPaddleY(quiet));
});

test('W and S leave the left paddle alone', () => {
  const page = loadPage().frames(1);
  page.chooseMode('human');
  page.frames(1);

  const before = playerPaddleY(page);
  page.fire('keydown', press('w'));
  page.frames(30);
  assert.equal(playerPaddleY(page), before);
});

test('switching the right paddle starts a new match', () => {
  const page = loadPage().frames(400);
  assert.ok(
    Number(page.elements.playerScore.textContent) +
      Number(page.elements.computerScore.textContent) >
      0,
    'no point was scored, so this proves nothing',
  );

  page.chooseMode('human');
  page.frames(1);
  assert.equal(page.elements.playerScore.textContent, 0);
});

test('the difficulty is turned off while a person has the paddle', () => {
  // It decides nothing in that mode, and a live control that decides nothing
  // is a question the player has to answer for no reason.
  const page = loadPage().frames(1);
  assert.equal(page.difficulty.disabled, false);

  page.chooseMode('human');
  assert.equal(page.difficulty.disabled, true);

  page.chooseMode('computer');
  assert.equal(page.difficulty.disabled, false);
});

test('losing the window drops player two\'s keys as well', () => {
  const page = loadPage().frames(1);
  page.chooseMode('human');
  page.frames(1);

  page.fire('keydown', press('s'));
  page.frames(10);
  page.fire('window:blur', {});

  const parked = computerPaddleY(page);
  page.frames(60);
  assert.equal(computerPaddleY(page), parked);
});

/* -------------------------------------------------------- the difficulty -- */

test('the page offers the three levels the engine knows', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const { DIFFICULTY } = require(path.join(ROOT, 'engine.js'));
  for (const name of Object.keys(DIFFICULTY)) {
    assert.match(html, new RegExp(`value="${name}"`), `${name} is not offered`);
  }
});

test('the select starts on the level the engine defaults to', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const { DEFAULT_DIFFICULTY } = require(path.join(ROOT, 'engine.js'));
  assert.match(html, new RegExp(`value="${DEFAULT_DIFFICULTY}" selected`));
});

/** Where the computer's paddle was on the last frame that drew it. */
function computerPaddleY(page) {
  const fills = page.drawn.filter(
    ([key, args]) => key === 'fillRect' && args.length === 4 && args[0] === 775,
  );
  assert.ok(fills.length > 0, 'the computer paddle was never drawn');
  return fills[fills.length - 1][1][1];
}

test('choosing a level changes how the computer plays', () => {
  // The levels themselves are tested against the engine, where the ball can
  // be put where the test wants it. What this checks is that the selection
  // reaches the engine at all: the same opening, played by two different
  // opponents, must not trace the same paddle path.
  const pathOf = (level) => {
    const page = loadPage().frames(1);
    page.chooseDifficulty(level);

    const path = [];
    for (let i = 0; i < 200; i += 1) {
      page.frames(1);
      path.push(computerPaddleY(page));
    }
    return path;
  };

  assert.notDeepEqual(pathOf('easy'), pathOf('hard'));
});

test('changing the opponent starts a new match', () => {
  // A scoreline half against one opponent and half against another says
  // nothing about either.
  const page = loadPage().frames(400);
  assert.ok(
    Number(page.elements.playerScore.textContent) +
      Number(page.elements.computerScore.textContent) >
      0,
    'no point was scored, so this proves nothing',
  );

  page.chooseDifficulty('hard');
  page.frames(1);

  assert.equal(page.elements.playerScore.textContent, 0);
  assert.equal(page.elements.computerScore.textContent, 0);
});

test('the dropdown gives the keyboard back after a choice', () => {
  // It keeps focus after a click, so a later space or arrow would work the
  // dropdown instead of the paddle.
  const page = loadPage().frames(1);
  page.chooseDifficulty('easy');
  assert.equal(page.difficulty.blurred, 1);
});

/* ------------------------------------------------------------- the pause -- */

test('P pauses the game', () => {
  const page = loadPage().frames(60);
  const before = ballX(page);
  page.fire('keydown', press('p'));
  page.frames(60);
  assert.equal(ballX(page), before, 'the ball kept moving while paused');
});

test('Escape pauses it too', () => {
  const page = loadPage().frames(60);
  page.fire('keydown', press('Escape'));
  const before = ballX(page);
  page.frames(60);
  assert.equal(ballX(page), before);
});

test('P again carries on', () => {
  const page = loadPage().frames(60);
  page.fire('keydown', press('p'));
  page.frames(10);
  page.fire('keydown', press('p'));
  const before = ballX(page);
  page.frames(60);
  assert.notEqual(ballX(page), before, 'the ball stayed frozen after resuming');
});

test('an arrow key resumes, so the way out is the same motion as playing', () => {
  // Having to find the pause key again before you can move is a worse
  // interruption than the one being resumed from.
  const page = loadPage().frames(60);
  page.fire('keydown', press('p'));
  page.frames(10);
  page.fire('keydown', press('ArrowUp'));
  const before = ballX(page);
  page.frames(60);
  assert.notEqual(ballX(page), before);
});

test('a paused game still draws', () => {
  // The overlay is a drawing. Freezing the loop as well as the simulation
  // would leave whatever was on the canvas when the pause landed.
  const page = loadPage().frames(60);
  page.fire('keydown', press('p'));
  const before = page.drawn.length;
  page.frames(10);
  assert.ok(page.drawn.length > before, 'nothing was drawn while paused');
});

test('losing the window pauses rather than playing on without you', () => {
  const page = loadPage().frames(60);
  page.fire('window:blur', {});
  const before = ballX(page);
  page.frames(120);
  assert.equal(ballX(page), before, 'the rally continued after the tab lost focus');
});

test('coming back does not resume on its own', () => {
  // A ball already in flight when you look again is how a point is lost to a
  // tab switch.
  const page = loadPage().frames(60);
  page.fire('window:blur', {});
  page.frames(10);
  const before = ballX(page);
  page.frames(120);
  assert.equal(ballX(page), before);
});

test('a finished match cannot be paused', () => {
  const page = loadPage().frames(20_000);
  page.fire('keydown', press('p'));
  page.frames(2);
  const drawn = page.drawn.filter(([key]) => key === 'fillText').map(([, args]) => args[0]);
  assert.ok(drawn.some((t) => /WIN|GAME OVER/.test(t)), drawn.join(' | '));
  assert.ok(!drawn.includes('PAUSED'), 'the pause overlay was drawn over the result');
});

/* ------------------------------------------------------------- the touch -- */

test('dragging a finger down the board moves the paddle', () => {
  const page = loadPage().frames(1);
  const before = playerPaddleY(page);
  page.touch('touchmove', 390);
  page.frames(30);
  assert.ok(playerPaddleY(page) > before, 'the paddle ignored the touch');
});

test('a tap aims the paddle without waiting for the finger to move', () => {
  // touchmove alone leaves the first tap doing nothing at all.
  const page = loadPage().frames(1);
  const before = playerPaddleY(page);
  page.touch('touchstart', 390);
  page.frames(30);
  assert.ok(playerPaddleY(page) > before, 'touchstart did not aim');
});

test('a drag on the board does not scroll the page out from under it', () => {
  const page = loadPage().frames(1);
  assert.equal(page.touch('touchmove', 200), true, 'the default was not prevented');

  // Which only works if the listener asked not to be passive.
  for (const type of ['canvas:touchstart', 'canvas:touchmove']) {
    const [registration] = page.registrations(type);
    assert.ok(registration, `nothing listens for ${type}`);
    assert.equal(registration.options && registration.options.passive, false, type);
  }
});

test('a touch with no finger in it is ignored rather than followed', () => {
  const page = loadPage().frames(1);
  const before = playerPaddleY(page);
  assert.doesNotThrow(() => page.touch('touchmove', undefined));
  page.frames(30);
  assert.equal(playerPaddleY(page), before);
});

test('tapping the board restarts a finished match', () => {
  // There is no space bar on a phone, so without this the game ends and
  // cannot be started again.
  const page = loadPage().frames(20_000);
  page.touch('touchend');
  page.frames(1);
  assert.equal(page.elements.playerScore.textContent, 0);
  assert.equal(page.elements.computerScore.textContent, 0);
});

test('space does nothing while a match is still being played', () => {
  // Long enough for a point, short enough that the match is not already over
  // — once it is, space restarting it is the correct behaviour and this test
  // would be measuring that instead.
  const page = loadPage().frames(400);
  const total = () =>
    Number(page.elements.playerScore.textContent) + Number(page.elements.computerScore.textContent);
  assert.ok(total() > 0, 'no point was scored at all, so this proves nothing');

  page.fire('keydown', press(' '));
  page.frames(1);
  assert.ok(total() > 0, 'space wiped the score mid-match');
});
