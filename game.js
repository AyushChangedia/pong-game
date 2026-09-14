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

const { createState, resetMatch, updateAI, updatePlayer, stepBall, winner } =
  window.ENGINE;

const state = createState({ width: canvas.width, height: canvas.height });

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

document.addEventListener('keydown', (e) => {
  if (state.gameOver && (e.key === ' ' || e.key === 'Enter')) {
    e.preventDefault();
    resetMatch(state);
    return;
  }

  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    // Otherwise the browser scrolls the page while you are playing, which
    // drags the canvas out of view on short windows.
    e.preventDefault();
    input.pointer = false;
    if (e.key === 'ArrowUp') input.up = true;
    else input.down = true;
  }
});

document.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowUp') input.up = false;
  if (e.key === 'ArrowDown') input.down = false;
});

document.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  // Below 768px the stylesheet sets the canvas to width:100%/height:auto, so
  // its rendered height stops matching its 400px drawing buffer. Convert the
  // pointer into buffer coordinates or the paddle lags the cursor on mobile.
  if (rect.height === 0) return;
  input.pointerY = (e.clientY - rect.top) * (canvas.height / rect.height);
  input.pointer = true;
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
}

/* ----------------------------------------------------------------- loop -- */

function gameLoop() {
  if (!state.gameOver) {
    updatePlayer(state, input);
    updateAI(state);
    stepBall(state);
  }
  draw();
  requestAnimationFrame(gameLoop);
}

gameLoop();
})();
