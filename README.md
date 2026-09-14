# pong-game

Pong against the computer, in a canvas. First to five.

**Click on this link to play — https://ayushchangedia.github.io/pong-game/**

Mouse, arrow keys, or a finger on the board. Space, or a tap, plays again.

## What is where

| File | What it is |
| --- | --- |
| `engine.js` | The rules: where the ball goes, when it bounces, who scores, when the match ends. No canvas, no DOM. |
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

## Notes

The simulation runs on a fixed step of a sixtieth of a second, and a frame is
worth however many steps have come due since the last one. A frame used to be
exactly one step, which makes the speed of the game a property of the monitor —
the same code is a rally at 60Hz and unplayable at 144Hz. Catch-up is capped, so
returning to a backgrounded tab does not teleport the ball through a paddle.
