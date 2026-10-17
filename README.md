# pong-game

Pong against the computer, in a canvas. First to five.

**Click on this link to play — https://ayushchangedia.github.io/pong-game/**

Mouse, arrow keys, or a finger on the board. **P** or **Esc** pauses, **M**
mutes, space or a tap plays again. Switch the right paddle to a second person
and they get **W** and **S**.

## What is where

| File | What it is |
| --- | --- |
| `engine.js` | The rules: where the ball goes, when it bounces, who scores, when the match ends. No canvas, no DOM. |
| `sound.js` | Three synthesised blips. No files, no fetch, no decoding. |
| `game.js` | The browser: the canvas, the key and pointer handlers, the drawing, the loop. |
| `index.html`, `style.css` | The page. `engine.js` loads first — `game.js` reads `window.ENGINE` as it starts. |
| `tests/` | The suite. |

The split is the point. A game loop fails silently by nature: the ball goes
somewhere slightly wrong and you assume you missed it, because nothing throws
and nothing says so. With the rules in a file that has no screen attached, they
can be run a few thousand times and checked.

Both files are wrapped in a closure. Two plain `<script>` tags share one global
lexical scope, so the same name declared at the top level of each is a
redeclaration and the page dies on a `SyntaxError` before it draws a frame.
Only `window.ENGINE` escapes.

## Running it

```sh
npm test        # the suite — no dependencies, node:test
npm run serve   # http://localhost:8000
```

Opening `index.html` from the filesystem works too.

Node 22 or newer: the test script hands `node --test` a glob that older
runtimes reject.

## Playing it

| | |
| --- | --- |
| Left paddle | Mouse, arrow keys, or a finger on the board |
| Right paddle | The computer, or **W** / **S** for a second person |
| Pause | **P** or **Esc** — and automatically if the window loses focus |
| Mute | **M**, or the button |
| Play again | Space, or a tap |

The computer has three settings, and they differ in more than speed. Each one
also varies how far up the field it starts reacting and how badly it reads
where the ball is going — the misjudgement is a fixed offset rather than a
jitter, so the same shot fools it the same way twice and you can learn to play
it. On easy the gap it leaves is on the side the ball came from, so the shot
that beats it is the one played across it.

A rally speeds the ball up with every return, which is what gives a long
exchange a shape: the twentieth is genuinely harder than the first. The
counter appears once an exchange is worth calling a rally, and the result
screen reports the longest one of the match.

The side that concedes a point receives the next serve, as in any racket
sport, so a bad run does not also mean watching the ball fly away from you.

## Notes

The simulation runs on a fixed step of a sixtieth of a second, and a frame is
worth however many steps have come due since the last one. A frame used to be
exactly one step, which makes the speed of the game a property of the monitor —
the same code is a rally at 60Hz and unplayable at 144Hz. Catch-up is capped, so
returning to a backgrounded tab does not teleport the ball through a paddle.

The canvas is drawn at the screen's real pixels. Its buffer and its CSS box
were the same number, so on any display with a pixel ratio above one the
browser took an 800×400 image and stretched it — soft edges on the ball, a
shimmering centre line, on hardware with the pixels to draw both exactly.

A spin-heavy rally used to be able to grind the ball's horizontal speed to
nothing and leave it drifting between the walls, never reaching a paddle
again. There is a floor under it now, and the speed is traded from the
vertical rather than added, so the cap still means what it says.

Everything drawn on the canvas is invisible to a screen reader — it is one
image that changes sixty times a second — so the score, the pause and the
result go into a polite live region, written only when the text actually
changes. Setting the same string again re-announces it in some readers, and a
score read aloud sixty times a second is worse than none.
