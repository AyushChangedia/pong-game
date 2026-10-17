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

const state = createState({ width: canvas.width, height: canvas.height });

/* ------------------------------------------------------------- settings -- */

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
  pointerY: canvas.height / 2,
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
  input.pointerY = (clientY - rect.top) * (canvas.height / rect.height);
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
  ctx.moveTo(canvas.width / 2, 0);
  ctx.lineTo(canvas.width / 2, canvas.height);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawResult(who) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = who === 'player' ? '#00ff88' : '#ff006e';
  ctx.font = 'bold 48px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(
    who === 'player' ? 'YOU WIN!' : 'GAME OVER!',
    canvas.width / 2,
    canvas.height / 2,
  );
  ctx.font = '20px Arial';
  ctx.fillText('Press Space to play again', canvas.width / 2, canvas.height / 2 + 50);
}

function drawPaused() {
  // Lighter than the result overlay: the board underneath is still the thing
  // being looked at, and a rally frozen mid-flight is worth seeing.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 40px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2);
  ctx.font = '18px Arial';
  ctx.fillStyle = '#00ff88';
  ctx.fillText(
    'Press P, Escape or an arrow key to carry on',
    canvas.width / 2,
    canvas.height / 2 + 40,
  );
}

function draw() {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawCenterLine();
  drawPaddle(state.paddles.left);
  drawPaddle(state.paddles.right);
  drawBall();

  document.getElementById('playerScore').textContent = state.score.player;
  document.getElementById('computerScore').textContent = state.score.computer;

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
      stepBall(state);
    }
  }

  draw();
}

requestAnimationFrame(gameLoop);
})();
