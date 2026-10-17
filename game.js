/**
 * game.js — the browser half of Pong.
 *
 * The canvas, the key and pointer handlers, the drawing, the loop. Every rule
 * about where the ball goes and who scores lives in engine.js, which has no
 * DOM in it and can therefore be run and checked. This file is the part that
 * only makes sense with a screen attached.
 */

(function () {
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

/**
 * The field, in the units everything else is written in.
 *
 * Read once, before the backing store is resized, because that resize changes
 * canvas.width — and every coordinate in this file, and the whole engine,
 * means "units of the 800x400 board" rather than "device pixels".
 */
const FIELD = { width: canvas.width, height: canvas.height };

/**
 * Match the canvas's backing store to the screen it is on.
 *
 * A canvas has two sizes: the buffer it draws into and the box CSS gives it.
 * They were the same number, so on any display with a pixel ratio above one —
 * which is every phone and most laptops — the browser took an 800x400 image
 * and scaled it up. The ball had soft edges and the dashed centre line
 * shimmered, on hardware with the pixels to draw both exactly.
 *
 * The buffer is sized in device pixels and the context scaled by the same
 * factor, so nothing else has to change: a draw at x=400 still lands in the
 * middle of the board.
 */
function matchPixelRatio() {
  const ratio = window.devicePixelRatio;
  // Capped: a ratio of 3 on a large board is nine times the fill rate for a
  // difference nobody can see, and some browsers report absurd values while
  // a page is being zoomed.
  const scale = Number.isFinite(ratio) && ratio > 0 ? Math.min(ratio, 2) : 1;

  const wanted = { width: Math.round(FIELD.width * scale), height: Math.round(FIELD.height * scale) };
  if (canvas.width === wanted.width && canvas.height === wanted.height) return scale;

  canvas.width = wanted.width;
  canvas.height = wanted.height;
  // The CSS box stays in layout pixels, or the board grows on a retina screen.
  canvas.style.width = `${FIELD.width}px`;
  canvas.style.height = `${FIELD.height}px`;
  return scale;
}

matchPixelRatio();

const {
  createState,
  resetMatch,
  updatePlayer,
  updateOpponent,
  isRunning,
  setDifficulty,
  setPaused,
  togglePause,
  planSteps,
  stepBall,
  winner,
} = window.ENGINE;

const state = createState({ width: FIELD.width, height: FIELD.height });

/**
 * The noises, if this browser makes any.
 *
 * sound.js loads before this file, but a missing script should mean a silent
 * game rather than a page that fails on its first line.
 */
// The API is handed over rather than looked up, so the only place that knows
// where it lives is the page — which is the only place that should.
const sound = window.SOUND
  ? window.SOUND.createSound(window.AudioContext || window.webkitAudioContext)
  : { play() {}, setMuted() {}, toggleMuted() { return false; }, muted: false };

/** Below this an exchange is not a rally, it is just play. */
const RALLY_WORTH_SHOWING = 3;

/* ------------------------------------------------------------- settings -- */

const muteButton = document.getElementById('mute');

function showMuted() {
  if (!muteButton) return;
  muteButton.textContent = sound.muted ? '🔇 Muted' : '🔊 Sound';
  // aria-pressed, not just the label: a screen reader should know this is a
  // switch and which way it is set, not read an emoji and a word.
  muteButton.setAttribute('aria-pressed', String(sound.muted));
}

if (muteButton) {
  showMuted();
  muteButton.addEventListener('click', () => {
    sound.toggleMuted();
    showMuted();
    // Otherwise space, which plays again, presses this button instead.
    muteButton.blur();
  });
}

const modeSelect = document.getElementById('mode');
const difficultySelect = document.getElementById('difficulty');

/** The difficulty only means anything while the computer is playing. */
function syncDifficultyAvailability() {
  if (difficultySelect) difficultySelect.disabled = state.twoPlayer;
}

if (modeSelect) {
  state.twoPlayer = modeSelect.value === 'human';
  syncDifficultyAvailability();

  modeSelect.addEventListener('change', () => {
    state.twoPlayer = modeSelect.value === 'human';
    syncDifficultyAvailability();
    // Half a match against the computer and half against a person is not a
    // result either of them earned.
    resetMatch(state);
    modeSelect.blur();
  });
}

if (difficultySelect) {
  // The engine decides what the name means, including that an unrecognised
  // one falls back — so the select is read, not trusted.
  setDifficulty(state, difficultySelect.value);

  difficultySelect.addEventListener('change', () => {
    setDifficulty(state, difficultySelect.value);
    // Changing the opponent mid-match would leave a scoreline half of each,
    // which says nothing about either. Start again.
    resetMatch(state);
    // The select keeps focus after a click, so a later space or arrow key
    // would work the dropdown instead of the paddle.
    difficultySelect.blur();
  });
}

/* ---------------------------------------------------------------- input -- */

// What the browser last knew. The engine reads this and nothing else.
const input = {
  up: false,
  down: false,
  pointerY: FIELD.height / 2,
  // Whichever device was used last owns the paddle. Without this the pointer
  // drags the paddle back to the resting cursor every frame, and the arrow
  // keys appear to do nothing.
  pointer: true,
};

// Player two, on W and S. No pointer: one mouse cannot drive two paddles, and
// leaving `pointer` true here would drag the right paddle to the cursor the
// first player is using.
const opponentInput = { up: false, down: false, pointer: false };

document.addEventListener('keydown', (e) => {
  if (state.gameOver && (e.key === ' ' || e.key === 'Enter')) {
    e.preventDefault();
    resetMatch(state);
    return;
  }

  // M mutes. Checked before the pause keys so it works while paused too.
  if (e.key === 'm' || e.key === 'M') {
    e.preventDefault();
    sound.toggleMuted();
    showMuted();
    return;
  }

  if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
    e.preventDefault();
    togglePause(state);
    return;
  }

  // Any arrow press resumes, so the way out of a pause is the same motion as
  // playing. Having to find the pause key again to start moving is a worse
  // interruption than the one being resumed from.
  if (state.paused && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    setPaused(state, false);
  }

  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    // Otherwise the browser scrolls the page while you are playing, which
    // drags the canvas out of view on short windows.
    e.preventDefault();
    input.pointer = false;
    if (e.key === 'ArrowUp') input.up = true;
    else input.down = true;
    return;
  }

  // W and S, whichever case the caps lock happens to be in.
  const key = e.key.toLowerCase();
  if (key === 'w' || key === 's') {
    e.preventDefault();
    if (state.paused) setPaused(state, false);
    if (key === 'w') opponentInput.up = true;
    else opponentInput.down = true;
  }
});

document.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowUp') input.up = false;
  if (e.key === 'ArrowDown') input.down = false;

  const key = e.key.toLowerCase();
  if (key === 'w') opponentInput.up = false;
  if (key === 's') opponentInput.down = false;
});

/**
 * Take a client-space y and aim the paddle at it.
 *
 * Below 768px the stylesheet sets the canvas to width:100%/height:auto, so
 * its rendered height stops matching its 400px drawing buffer. The pointer
 * has to be converted into buffer coordinates or the paddle lags the finger
 * by however much the canvas has been scaled.
 */
function aimAt(clientY) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.height) return;
  input.pointerY = (clientY - rect.top) * (FIELD.height / rect.height);
  input.pointer = true;
}

document.addEventListener('mousemove', (e) => aimAt(e.clientY));

// Touch. The page is styled for phones, the instructions offer a mouse and
// the arrow keys, and a phone has neither — so on the device the stylesheet
// goes to the most trouble for, the paddle could not be moved at all.
//
// Non-passive, because the drag has to be stopped from scrolling the page
// out from under the game. touchmove alone would leave a tap doing nothing
// until the finger moved, so touchstart aims too.
for (const type of ['touchstart', 'touchmove']) {
  canvas.addEventListener(
    type,
    (e) => {
      const touch = e.touches && e.touches[0];
      if (!touch) return;
      e.preventDefault();
      aimAt(touch.clientY);
    },
    { passive: false },
  );
}

// A tap anywhere restarts a finished match, since there is no space bar.
canvas.addEventListener('touchend', () => {
  if (state.gameOver) resetMatch(state);
});

/* -------------------------------------------------------------- drawing -- */

function drawPaddle(paddle) {
  ctx.fillStyle = '#00ff88';
  ctx.fillRect(paddle.x, paddle.y, paddle.width, paddle.height);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.strokeRect(paddle.x, paddle.y, paddle.width, paddle.height);
}

function drawBall() {
  ctx.fillStyle = '#ff006e';
  ctx.beginPath();
  ctx.arc(state.ball.x, state.ball.y, state.ball.size, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawCenterLine() {
  ctx.strokeStyle = '#666666';
  ctx.setLineDash([10, 10]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(FIELD.width / 2, 0);
  ctx.lineTo(FIELD.width / 2, FIELD.height);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawResult(who) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  ctx.fillStyle = who === 'player' ? '#00ff88' : '#ff006e';
  ctx.font = 'bold 48px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(
    who === 'player' ? 'YOU WIN!' : 'GAME OVER!',
    FIELD.width / 2,
    FIELD.height / 2,
  );
  ctx.font = '20px Arial';
  ctx.fillText('Press Space to play again', FIELD.width / 2, FIELD.height / 2 + 50);

  if (state.longestRally >= RALLY_WORTH_SHOWING) {
    ctx.font = '16px Arial';
    ctx.fillStyle = '#9a9a9a';
    ctx.fillText(
      `Longest rally: ${state.longestRally} returns`,
      FIELD.width / 2,
      FIELD.height / 2 + 85,
    );
  }
}

function drawPaused() {
  // Lighter than the result overlay: the board underneath is still the thing
  // being looked at, and a rally frozen mid-flight is worth seeing.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 40px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('PAUSED', FIELD.width / 2, FIELD.height / 2);
  ctx.font = '18px Arial';
  ctx.fillStyle = '#00ff88';
  ctx.fillText(
    'Press P, Escape or an arrow key to carry on',
    FIELD.width / 2,
    FIELD.height / 2 + 40,
  );
}

/**
 * The rally count, above the board.
 *
 * Only once an exchange is worth calling one. A "1" over every serve is
 * noise, and a counter that is almost always showing its lowest value reads
 * as broken rather than as quiet.
 */
function drawRally() {
  const showing = state.rally >= RALLY_WORTH_SHOWING;
  const best = state.longestRally >= RALLY_WORTH_SHOWING;
  if (!showing && !best) return;

  ctx.textAlign = 'center';
  ctx.font = 'bold 22px Arial';
  ctx.fillStyle = showing ? '#00ff88' : '#4a4a4a';
  ctx.fillText(showing ? `RALLY ${state.rally}` : `BEST ${state.longestRally}`, FIELD.width / 2, 34);

  if (showing && best) {
    ctx.font = '13px Arial';
    ctx.fillStyle = '#6a6a6a';
    ctx.fillText(`BEST ${state.longestRally}`, FIELD.width / 2, 54);
  }
}

function draw() {
  // The ratio can change while the page is open: a window dragged to another
  // monitor, or the browser zoomed.
  const scale = matchPixelRatio();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);

  drawCenterLine();
  drawPaddle(state.paddles.left);
  drawPaddle(state.paddles.right);
  drawBall();

  document.getElementById('playerScore').textContent = state.score.player;
  document.getElementById('computerScore').textContent = state.score.computer;

  drawRally();

  const result = winner(state);
  if (result) drawResult(result);
  else if (state.paused) drawPaused();
}

/* ----------------------------------------------------------------- loop -- */

// The clock the simulation runs on, which is not the clock the screen runs
// on. A frame is worth however many fixed steps have come due since the last
// one, so a 144Hz display plays the same game as a 60Hz one rather than the
// same game at nearly two and a half times the speed.
let lastFrame = null;
let carry = 0;

/**
 * Let go of every key, and forget how long it has been since the last frame.
 *
 * Both halves matter when the game loses focus. A keyup that happens while
 * another window is in front is delivered to that window, so the arrow key
 * you were holding is still held as far as this page knows, and coming back
 * finds the paddle sliding into a wall on its own. And the clock has been
 * running the whole time it was away: the first frame back carries the
 * entire absence, which the step cap would then spend on catch-up nobody
 * asked for.
 */
function standDown() {
  input.up = false;
  input.down = false;
  opponentInput.up = false;
  opponentInput.down = false;
  lastFrame = null;
  carry = 0;
  // Losing the window mid-rally is exactly the situation pausing exists for.
  // Resuming is deliberately not automatic: coming back to a ball already in
  // flight is how you lose a point to a tab switch.
  setPaused(state, true);
}

document.addEventListener('visibilitychange', standDown);
window.addEventListener('blur', standDown);

function gameLoop(now) {
  requestAnimationFrame(gameLoop);

  const elapsed = lastFrame === null ? 0 : now - lastFrame;
  lastFrame = now;

  if (isRunning(state)) {
    const plan = planSteps(elapsed, carry);
    carry = plan.carry;
    for (let i = 0; i < plan.steps; i += 1) {
      updatePlayer(state, input);
      updateOpponent(state, opponentInput);

      const events = stepBall(state);
      if (events.scorer) sound.play('point');
      else if (events.hitPaddle) sound.play('paddle');
      else if (events.hitWall) sound.play('wall');
    }
  }

  draw();
}

requestAnimationFrame(gameLoop);
})();
