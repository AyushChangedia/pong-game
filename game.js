// Canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game variables
const PADDLE_HEIGHT = 100;
const PADDLE_WIDTH = 15;
const BALL_SIZE = 10;
const PADDLE_SPEED = 6;
const AI_SPEED = 5;
const WIN_SCORE = 5;

// Paddle object
const paddles = {
    left: {
        x: 10,
        y: canvas.height / 2 - PADDLE_HEIGHT / 2,
        width: PADDLE_WIDTH,
        height: PADDLE_HEIGHT,
        dy: 0
    },
    right: {
        x: canvas.width - PADDLE_WIDTH - 10,
        y: canvas.height / 2 - PADDLE_HEIGHT / 2,
        width: PADDLE_WIDTH,
        height: PADDLE_HEIGHT,
        dy: 0
    }
};

// Ball object
const ball = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    dx: 5,
    dy: 5,
    size: BALL_SIZE
};

// Score object
const score = {
    player: 0,
    computer: 0
};

// Set once someone reaches WIN_SCORE; freezes simulation but not rendering.
let gameOver = false;

// Input handling
const keys = {};
let mouseY = canvas.height / 2;

// Whichever device was used last owns the paddle. Without this the mouse
// block below runs every frame and drags the paddle straight back to the
// pointer, so the arrow keys appear to do nothing.
let usingMouse = true;

document.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        // Otherwise the browser scrolls the page while you are playing, which
        // drags the canvas out of view on short windows.
        e.preventDefault();
        usingMouse = false;
    }
});

document.addEventListener('keyup', (e) => {
    keys[e.key] = false;
});

document.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    // Below 768px the stylesheet sets the canvas to width:100%/height:auto, so
    // its rendered height stops matching its 400px drawing buffer. Convert the
    // pointer into buffer coordinates or the paddle lags the cursor on mobile.
    mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);
    usingMouse = true;
});

// Update player paddle position
function updatePlayerPaddle() {
    // Arrow keys control
    if (keys['ArrowUp']) {
        paddles.left.y = Math.max(0, paddles.left.y - PADDLE_SPEED);
    }
    if (keys['ArrowDown']) {
        paddles.left.y = Math.min(canvas.height - PADDLE_HEIGHT, paddles.left.y + PADDLE_SPEED);
    }

    // Mouse control — skipped while the keyboard is driving
    if (!usingMouse) {
        return;
    }

    const targetY = mouseY - PADDLE_HEIGHT / 2;
    const currentDistance = Math.abs(paddles.left.y - targetY);
    
    if (currentDistance > 5) {
        if (paddles.left.y < targetY) {
            paddles.left.y = Math.min(canvas.height - PADDLE_HEIGHT, paddles.left.y + PADDLE_SPEED);
        } else {
            paddles.left.y = Math.max(0, paddles.left.y - PADDLE_SPEED);
        }
    }
}

// Update AI paddle position
function updateAIPaddle() {
    const paddle = paddles.right;
    const paddleCenter = paddle.y + PADDLE_HEIGHT / 2;

    // AI tracks the ball
    if (Math.abs(paddleCenter - ball.y) > 5) {
        if (paddleCenter < ball.y) {
            paddle.y = Math.min(canvas.height - PADDLE_HEIGHT, paddle.y + AI_SPEED);
        } else {
            paddle.y = Math.max(0, paddle.y - AI_SPEED);
        }
    }
}

// Check collision between ball and paddle
function checkPaddleCollision(paddle) {
    if (
        ball.x - ball.size < paddle.x + paddle.width &&
        ball.x + ball.size > paddle.x &&
        ball.y - ball.size < paddle.y + paddle.height &&
        ball.y + ball.size > paddle.y
    ) {
        // Collision detected
        ball.dx *= -1;

        // Add spin based on where ball hits paddle
        const hitPos = (ball.y - (paddle.y + PADDLE_HEIGHT / 2)) / (PADDLE_HEIGHT / 2);
        ball.dy += hitPos * 3;

        // Ensure ball doesn't get stuck
        if (paddle === paddles.left) {
            ball.x = paddle.x + paddle.width + ball.size;
        } else {
            ball.x = paddle.x - ball.size;
        }

        return true;
    }
    return false;
}

// Update ball position
function updateBall() {
    ball.x += ball.dx;
    ball.y += ball.dy;

    // Wall collision (top and bottom)
    if (ball.y - ball.size < 0 || ball.y + ball.size > canvas.height) {
        ball.dy *= -1;
        ball.y = Math.max(ball.size, Math.min(canvas.height - ball.size, ball.y));
    }

    // Paddle collision
    checkPaddleCollision(paddles.left);
    checkPaddleCollision(paddles.right);

    // Scoring
    if (ball.x - ball.size < 0) {
        score.computer++;
        resetBall();
    } else if (ball.x + ball.size > canvas.width) {
        score.player++;
        resetBall();
    }

    if (score.player >= WIN_SCORE || score.computer >= WIN_SCORE) {
        gameOver = true;
    }

    // Cap ball speed
    const maxSpeed = 8;
    const speed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
    if (speed > maxSpeed) {
        ball.dx = (ball.dx / speed) * maxSpeed;
        ball.dy = (ball.dy / speed) * maxSpeed;
    }
}

// Reset ball to center
function resetBall() {
    ball.x = canvas.width / 2;
    ball.y = canvas.height / 2;
    ball.dx = (Math.random() > 0.5 ? 1 : -1) * 5;
    ball.dy = (Math.random() - 0.5) * 5;
}

// Draw paddle
function drawPaddle(paddle) {
    ctx.fillStyle = '#00ff88';
    ctx.fillRect(paddle.x, paddle.y, paddle.width, paddle.height);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(paddle.x, paddle.y, paddle.width, paddle.height);
}

// Draw ball
function drawBall() {
    ctx.fillStyle = '#ff006e';
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
}

// Draw center line
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

// Draw game
function draw() {
    // Clear canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw center line
    drawCenterLine();

    // Draw paddles and ball
    drawPaddle(paddles.left);
    drawPaddle(paddles.right);
    drawBall();

    // Update score display
    document.getElementById('playerScore').textContent = score.player;
    document.getElementById('computerScore').textContent = score.computer;

    // Check for win condition
    if (score.player >= WIN_SCORE) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#00ff88';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('YOU WIN!', canvas.width / 2, canvas.height / 2);
        ctx.font = '20px Arial';
        ctx.fillText('Refresh to play again', canvas.width / 2, canvas.height / 2 + 50);
        return;
    } else if (score.computer >= WIN_SCORE) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#ff006e';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER!', canvas.width / 2, canvas.height / 2);
        ctx.font = '20px Arial';
        ctx.fillText('Computer wins!', canvas.width / 2, canvas.height / 2 + 50);
        return;
    }
}

// Game loop
function gameLoop() {
    if (!gameOver) {
        updatePlayerPaddle();
        updateAIPaddle();
        updateBall();
    }
    draw();
    requestAnimationFrame(gameLoop);
}

// Start game
gameLoop();