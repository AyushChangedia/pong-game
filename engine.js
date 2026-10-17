/**
 * engine.js — the rules of Pong, with no canvas and no DOM in them.
 *
 * game.js owns the browser: the canvas, the key handlers, the drawing. This
 * owns what actually happens — where the ball goes, when it bounces, who
 * scores, when the match ends.
 *
 * Split out so it can be run, because none of it could be before. Every bug in
 * a game loop is silent by nature: the ball goes somewhere slightly wrong and
 * you assume you missed it. Nothing throws, so nothing tells you.
 *
 * Loaded both as a plain script in the browser (it assigns to window) and as a
 * module in Node, so there is one copy rather than two that drift.
 */

// Everything below is inside a closure. engine.js and game.js are both
// plain <script> tags, which in a browser share one global lexical scope:
// a top-level `function createState` here and a top-level `const
// { createState } = window.ENGINE` there is a redeclaration, and the page
// dies on a SyntaxError before a single frame is drawn. Only ENGINE
// escapes.
(function () {
  const FIELD = { width: 800, height: 400 };

  const RULES = {
    paddleHeight: 100,
    paddleWidth: 15,
    paddleInset: 10,
    ballSize: 10,
    paddleSpeed: 6,
    aiSpeed: 5,
    winScore: 5,
    serveSpeed: 5,
    maxSpeed: 8,
    /** How much the contact point off-centre bends the bounce. */
    spin: 3,
    /** The dead zone that stops a paddle jittering around its target. */
    deadZone: 5,
    /**
     * How much faster the ball gets with each return.
     *
     * A rally at one constant speed has no shape: the twentieth exchange is
     * exactly as easy as the first, so a good rally ends only when somebody
     * stops concentrating. Multiplying by a little over one each time means a
     * long rally gets genuinely harder and ends because it was hard.
     */
    rallySpeedUp: 1.04,
    /**
     * The least horizontal speed the ball is allowed to keep.
     *
     * Spin adds to dy and the cap then scales both components down, so a long
     * rally can grind dx towards nothing and leave the ball drifting almost
     * straight up and down between the walls, never reaching either paddle.
     * Speeding the ball up each return makes that happen sooner. A floor on
     * dx means the ball is always on its way somewhere.
     */
    minHorizontalSpeed: 2,
    /**
     * Steps the ball waits at the centre line before a serve goes.
     *
     * Sixty, so one second. A point used to end and the next one begin in the
     * same frame: the ball vanished off one edge and was already travelling
     * from the middle before anybody had registered the first thing. A beat
     * to see the score change is the difference between a rally ending and a
     * rally being interrupted.
     */
    serveDelaySteps: 60,
  };

  /**
   * How good the computer is, and in what way.
   *
   * Speed alone is a poor difficulty knob. A paddle that tracks the ball
   * perfectly and only moves slowly is not an easier opponent so much as a
   * differently-shaped wall: it never misreads anything, so the only way past
   * it is to out-run it. These three differ in how well the computer reads
   * the ball as well as how fast it can act on that reading.
   *
   * `aim` is how far off-centre of the ball it tries to be, as a fraction of
   * the paddle's own height — a steady misjudgement, not a jitter, so the
   * same shot is misread the same way and the player can learn it.
   *
   * `reach` is how far up the field it starts tracking, as a fraction of the
   * width. Below it the computer waits in place, which is what makes an easy
   * opponent beatable by a shot played early rather than only by a fast one.
   */
  const DIFFICULTY = {
    easy: { speed: 3.5, aim: 0.45, reach: 0.45 },
    normal: { speed: 5, aim: 0.2, reach: 0.75 },
    hard: { speed: 7, aim: 0, reach: 1 },
  };

  const DEFAULT_DIFFICULTY = 'normal';

  /** The named settings, or the default for anything unrecognised. */
  function difficultyOf(name) {
    return DIFFICULTY[name] || DIFFICULTY[DEFAULT_DIFFICULTY];
  }

  function createState(field = FIELD) {
    return {
      field: { ...field },
      paddles: {
        left: {
          x: RULES.paddleInset,
          y: field.height / 2 - RULES.paddleHeight / 2,
          width: RULES.paddleWidth,
          height: RULES.paddleHeight,
        },
        right: {
          x: field.width - RULES.paddleWidth - RULES.paddleInset,
          y: field.height / 2 - RULES.paddleHeight / 2,
          width: RULES.paddleWidth,
          height: RULES.paddleHeight,
        },
      },
      ball: {
        x: field.width / 2,
        y: field.height / 2,
        dx: RULES.serveSpeed,
        dy: RULES.serveSpeed,
        size: RULES.ballSize,
      },
      score: { player: 0, computer: 0 },
      /** Returns in the current rally. Resets on every serve. */
      rally: 0,
      /** Steps still to wait before the ball is released. */
      serveWait: 0,
      difficulty: DEFAULT_DIFFICULTY,
      gameOver: false,
      paused: false,
    };
  }

  /**
   * Hold a value between two bounds, with the low bound winning if they cross.
   *
   * They cross when the thing is bigger than the space it is being held in — a
   * paddle taller than the field. Math.min(high, …) last would win that
   * argument and hand back a negative y, which draws the paddle off the top of
   * the canvas entirely. Clamped to the low bound it at least starts on screen.
   */
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

  /** Keep a paddle on the field whatever moved it. */
  function clampPaddle(paddle, field) {
    paddle.y = clamp(paddle.y, 0, field.height - paddle.height);
    return paddle;
  }

  /** Do the ball and the paddle overlap right now? */
  function overlaps(ball, paddle) {
    return (
      ball.x - ball.size < paddle.x + paddle.width &&
      ball.x + ball.size > paddle.x &&
      ball.y - ball.size < paddle.y + paddle.height &&
      ball.y + ball.size > paddle.y
    );
  }

  /**
   * Bounce the ball off a paddle, if it is actually arriving at one.
   *
   * @param {'left'|'right'} side which paddle this is
   * @returns {boolean} whether a bounce happened
   */
  function bounceOffPaddle(state, side) {
    const paddle = state.paddles[side];
    const ball = state.ball;

    if (!overlaps(ball, paddle)) return false;

    ball.dx = Math.abs(ball.dx) * (side === 'left' ? 1 : -1);

    // Where on the paddle it landed, from -1 at the top to +1 at the bottom.
    const contact = (ball.y - (paddle.y + paddle.height / 2)) / (paddle.height / 2);
    ball.dy += contact * RULES.spin;

    // Push it clear so the next frame does not find them still overlapping.
    ball.x =
      side === 'left'
        ? paddle.x + paddle.width + ball.size
        : paddle.x - ball.size;

    state.rally += 1;
    ball.dx *= RULES.rallySpeedUp;
    ball.dy *= RULES.rallySpeedUp;

    capSpeed(ball);
    keepMovingAcross(ball);
    return true;
  }

  /**
   * Keep the ball crossing the field, not just bouncing between the walls.
   *
   * Trades vertical speed for horizontal rather than simply adding: the total
   * speed is what the cap just decided, and it should stay decided.
   */
  function keepMovingAcross(ball) {
    const floor = RULES.minHorizontalSpeed;
    if (Math.abs(ball.dx) >= floor) return ball;

    const speed = Math.hypot(ball.dx, ball.dy);
    const across = Math.min(floor, speed || floor);
    const direction = ball.dx < 0 ? -1 : 1;
    const remaining = Math.max(0, speed * speed - across * across);

    ball.dx = across * direction;
    ball.dy = Math.sqrt(remaining) * (ball.dy < 0 ? -1 : 1);
    return ball;
  }

  /** Hold the ball's total speed at or below the cap, keeping its direction. */
  function capSpeed(ball) {
    const speed = Math.hypot(ball.dx, ball.dy);
    if (speed > RULES.maxSpeed) {
      ball.dx = (ball.dx / speed) * RULES.maxSpeed;
      ball.dy = (ball.dy / speed) * RULES.maxSpeed;
    }
    return ball;
  }

  /** Put the ball back in the middle, served towards a random side. */
  /**
   * Put the ball back in the middle and send it off again.
   *
   * @param {'player'|'computer'|null} [towards] who to serve at. The side that
   *   just conceded gets the ball, which is how every racket sport does it and
   *   what keeps a run of points from compounding: losing three in a row
   *   should not also mean watching three serves fly away from you. With
   *   nobody named — the opening serve — the coin decides.
   */
  function serve(state, random = Math.random, towards = null, delay = 0) {
    const ball = state.ball;
    state.rally = 0;
    state.serveWait = Math.max(0, Math.round(delay) || 0);
    ball.x = state.field.width / 2;
    ball.y = state.field.height / 2;

    const direction =
      towards === 'player' ? -1 : towards === 'computer' ? 1 : random() > 0.5 ? 1 : -1;

    ball.dx = direction * RULES.serveSpeed;
    ball.dy = (random() - 0.5) * RULES.serveSpeed;
    return state;
  }

  /** Back to nil-nil with everything centred. */
  function resetMatch(state, random = Math.random) {
    state.score.player = 0;
    state.score.computer = 0;
    state.paddles.left.y = state.field.height / 2 - RULES.paddleHeight / 2;
    state.paddles.right.y = state.field.height / 2 - RULES.paddleHeight / 2;
    state.gameOver = false;
    state.paused = false;
    return serve(state, random, null, RULES.serveDelaySteps);
  }

  /** Move a paddle towards a target, at its own speed, with a dead zone. */
  function trackTowards(paddle, targetCentre, speed, field) {
    const centre = paddle.y + paddle.height / 2;
    if (Math.abs(centre - targetCentre) > RULES.deadZone) {
      paddle.y += centre < targetCentre ? speed : -speed;
    }
    return clampPaddle(paddle, field);
  }

  /**
   * The computer follows the ball — as well as its difficulty lets it.
   *
   * Three things vary: how fast it can move, how far up the field it bothers
   * to react, and how badly it reads where the ball is going. The misread is
   * a fixed offset rather than a random one, so the same shot fools it the
   * same way twice and a player can learn to play it.
   */
  function updateAI(state) {
    const paddle = state.paddles.right;
    const { speed, aim, reach } = difficultyOf(state.difficulty);

    // How far across the field the ball has come, from 0 at the left edge.
    const progress = state.ball.x / state.field.width;
    if (progress < 1 - reach) return clampPaddle(paddle, state.field);

    // Lean the wrong way by a fraction of the paddle, and pick the side by
    // where the ball actually is, so it misjudges away from the middle.
    const away = state.ball.y < state.field.height / 2 ? -1 : 1;
    const target = state.ball.y + away * aim * paddle.height;

    return trackTowards(paddle, target, speed, state.field);
  }

  /** Set the computer's difficulty. Unknown names fall back to the default. */
  function setDifficulty(state, name) {
    state.difficulty = DIFFICULTY[name] ? name : DEFAULT_DIFFICULTY;
    return state.difficulty;
  }

  /**
   * Move the player's paddle from an input reading.
   *
   * `input` is whatever the browser last knew: `{ up, down, pointerY, pointer }`.
   * `pointer` says whether the pointer is the thing currently driving — without
   * it the pointer branch runs every frame and drags the paddle straight back
   * to where the mouse is resting, so the arrow keys appear to do nothing.
   *
   * Keys win over the pointer when both are given, because a key is a
   * deliberate press and a resting pointer is not.
   */
  function updatePlayer(state, input = {}) {
    const paddle = state.paddles.left;
    const field = state.field;

    const up = Boolean(input.up);
    const down = Boolean(input.down);

    if (up || down) {
      // Both at once cancel out and the paddle holds still. It does not fall
      // through to the pointer — the player has their hands on the keys.
      if (up !== down) paddle.y += up ? -RULES.paddleSpeed : RULES.paddleSpeed;
      return clampPaddle(paddle, field);
    }

    if (input.pointer && Number.isFinite(input.pointerY)) {
      return trackTowards(paddle, input.pointerY, RULES.paddleSpeed, field);
    }

    return clampPaddle(paddle, field);
  }

  const TIMING = {
    /** One simulation step is one sixtieth of a second, always. */
    stepMs: 1000 / 60,
    /**
     * The most steps one frame may run. A tab left in the background gets no
     * frames at all, then one with the whole gap in it; without a cap the
     * catch-up teleports the ball across the field and through a paddle.
     */
    maxStepsPerFrame: 5,
  };

  /**
   * How many fixed steps this frame is worth, and what time is left over.
   *
   * The loop used to run exactly one step per animation frame, which ties the
   * speed of the game to the refresh rate of the screen: the same code is a
   * gentle rally at 60Hz and unplayable at 144Hz, and neither is wrong on its
   * own terms. Counting milliseconds instead means one speed everywhere.
   *
   * @param {number} elapsedMs time since the last frame
   * @param {number} carryMs milliseconds left over from that frame
   * @returns {{steps: number, carry: number}}
   */
  function planSteps(elapsedMs, carryMs = 0) {
    const carried = Number.isFinite(carryMs) && carryMs > 0 ? carryMs : 0;
    if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
      return { steps: 0, carry: carried };
    }

    const budget = carried + elapsedMs;
    const wanted = Math.floor(budget / TIMING.stepMs);

    if (wanted > TIMING.maxStepsPerFrame) {
      // Past the cap the surplus is thrown away rather than owed. Carrying it
      // would only make the next frame late as well, forever.
      return { steps: TIMING.maxStepsPerFrame, carry: 0 };
    }

    return { steps: wanted, carry: budget - wanted * TIMING.stepMs };
  }

  /**
   * Advance one step: move the ball, bounce it, award a point if it left.
   * Returns 'player', 'computer' or null depending on who scored.
   */
  function stepBall(state, random = Math.random) {
    const { ball, field } = state;

    // Waiting to serve. The ball sits at the centre line, already pointed the
    // way it is going to go, and nothing else in the step runs — a ball that
    // cannot move also cannot bounce or score.
    if (state.serveWait > 0) {
      state.serveWait -= 1;
      return null;
    }

    ball.x += ball.dx;
    ball.y += ball.dy;

    // Top and bottom walls.
    if (ball.y - ball.size < 0 || ball.y + ball.size > field.height) {
      ball.dy = Math.abs(ball.dy) * (ball.y - ball.size < 0 ? 1 : -1);
      ball.y = clamp(ball.y, ball.size, field.height - ball.size);
    }

    bounceOffPaddle(state, 'left');
    bounceOffPaddle(state, 'right');

    let scorer = null;
    if (ball.x + ball.size < 0) scorer = 'computer';
    else if (ball.x - ball.size > field.width) scorer = 'player';

    if (scorer) {
      state.score[scorer] += 1;
      if (state.score[scorer] >= RULES.winScore) state.gameOver = true;
      // The one who conceded receives. `scorer` is who won the point, so the
      // ball goes to the other side.
      else {
        serve(
          state,
          random,
          scorer === 'player' ? 'computer' : 'player',
          RULES.serveDelaySteps,
        );
      }
    }

    return scorer;
  }

  /**
   * Whether the simulation should advance this step.
   *
   * Three things stop it, and they are not the same thing. A finished match is
   * over and stays over. A paused match is waiting for the player to come
   * back. Both still draw — the result screen and the pause overlay are
   * drawings — so this is deliberately not "should we render".
   */
  function isRunning(state) {
    return !state.gameOver && !state.paused;
  }

  /** Pause, resume, or flip. Does nothing to a match that has already ended. */
  function setPaused(state, paused) {
    // Pausing a finished match would leave a pause overlay over the result,
    // and resuming it would have nothing to resume.
    if (state.gameOver) return false;
    state.paused = Boolean(paused);
    return state.paused;
  }

  function togglePause(state) {
    return setPaused(state, !state.paused);
  }

  /** Who has won, or null while the match is still on. */
  function winner(state) {
    if (state.score.player >= RULES.winScore) return 'player';
    if (state.score.computer >= RULES.winScore) return 'computer';
    return null;
  }

  const ENGINE = {
    FIELD,
    RULES,
    TIMING,
    createState,
    clamp,
    clampPaddle,
    overlaps,
    bounceOffPaddle,
    capSpeed,
    keepMovingAcross,
    serve,
    resetMatch,
    DIFFICULTY,
    DEFAULT_DIFFICULTY,
    difficultyOf,
    trackTowards,
    updateAI,
    setDifficulty,
    updatePlayer,
    isRunning,
    setPaused,
    togglePause,
    planSteps,
    stepBall,
    winner,
  };

  // Browser: a plain <script> tag, so hang it on window.
  if (typeof window !== 'undefined') window.ENGINE = ENGINE;
  // Node: CommonJS, so the tests can require it. Same object either way.
  if (typeof module !== 'undefined' && module.exports) module.exports = ENGINE;
})();
