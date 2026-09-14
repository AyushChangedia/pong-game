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
};

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
    gameOver: false,
  };
}

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

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

  capSpeed(ball);
  return true;
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
function serve(state, random = Math.random) {
  const ball = state.ball;
  ball.x = state.field.width / 2;
  ball.y = state.field.height / 2;
  ball.dx = (random() > 0.5 ? 1 : -1) * RULES.serveSpeed;
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
  return serve(state, random);
}

/** Move a paddle towards a target, at its own speed, with a dead zone. */
function trackTowards(paddle, targetCentre, speed, field) {
  const centre = paddle.y + paddle.height / 2;
  if (Math.abs(centre - targetCentre) > RULES.deadZone) {
    paddle.y += centre < targetCentre ? speed : -speed;
  }
  return clampPaddle(paddle, field);
}

/** The computer follows the ball. */
function updateAI(state) {
  return trackTowards(state.paddles.right, state.ball.y, RULES.aiSpeed, state.field);
}

/**
 * Advance one step: move the ball, bounce it, award a point if it left.
 * Returns 'player', 'computer' or null depending on who scored.
 */
function stepBall(state, random = Math.random) {
  const { ball, field } = state;

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
    else serve(state, random);
  }

  return scorer;
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
  createState,
  clamp,
  clampPaddle,
  overlaps,
  bounceOffPaddle,
  capSpeed,
  serve,
  resetMatch,
  trackTowards,
  updateAI,
  stepBall,
  winner,
};

// Browser: a plain <script> tag, so hang it on window.
if (typeof window !== 'undefined') window.ENGINE = ENGINE;
// Node: CommonJS, so the tests can require it. Same object either way.
if (typeof module !== 'undefined' && module.exports) module.exports = ENGINE;
