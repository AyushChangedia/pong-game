/**
 * sound.test.js — the three noises, and every way a browser refuses to make
 * them.
 *
 * Audio is the part of a game most likely to be unavailable and least worth
 * failing over. A page that cannot make a sound should be a silent game, not
 * a broken one, so most of this file is about what happens when the browser
 * says no.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { createSound, NOTES } = require('../sound.js');

/** A note-taking stand-in for the Web Audio API. */
function fakeAudio({ state = 'running', failToConstruct = false } = {}) {
  const log = { contexts: 0, played: [], resumed: 0 };

  class FakeContext {
    constructor() {
      if (failToConstruct) throw new Error('audio is not available here');
      log.contexts += 1;
      this.state = state;
      this.currentTime = 0;
      this.destination = { name: 'speakers' };
    }

    resume() {
      log.resumed += 1;
      this.state = 'running';
    }

    createOscillator() {
      const node = {
        type: null,
        frequency: { value: 0 },
        connect() {},
        start: (at) => {
          node.startedAt = at;
        },
        stop: (at) => {
          log.played.push({ hz: node.frequency.value, type: node.type, until: at });
        },
      };
      return node;
    }

    createGain() {
      return {
        gain: {
          setValueAtTime(value) {
            log.volume = value;
          },
          exponentialRampToValueAtTime(value) {
            log.rampedTo = value;
          },
        },
        connect() {},
      };
    }
  }

  return { FakeContext, log };
}

/* ------------------------------------------------------------- the notes -- */

test('there is a note for each thing that happens', () => {
  assert.deepEqual(Object.keys(NOTES).sort(), ['paddle', 'point', 'wall']);
});

test('every note has a pitch and a length', () => {
  for (const [name, note] of Object.entries(NOTES)) {
    assert.ok(note.hz > 0, `${name} has no pitch`);
    assert.ok(note.seconds > 0, `${name} has no length`);
  }
});

test('a point is the one you would hear from the next room', () => {
  assert.ok(NOTES.point.seconds > NOTES.paddle.seconds);
  assert.ok(NOTES.point.hz < NOTES.paddle.hz);
});

test('the paddle and the wall do not sound the same', () => {
  // Two identical blips tell you something happened but not what.
  assert.notEqual(NOTES.paddle.hz, NOTES.wall.hz);
});

/* ------------------------------------------------------------- playing -- */

test('playing a note makes a sound at its pitch', () => {
  const { FakeContext, log } = fakeAudio();
  const sound = createSound(FakeContext);

  assert.equal(sound.play('paddle'), true);
  assert.equal(log.played.length, 1);
  assert.equal(log.played[0].hz, NOTES.paddle.hz);
});

test('the note is faded out rather than cut off', () => {
  // An abruptly stopped waveform clicks, and a click on every bounce is worse
  // than no sound at all.
  const { FakeContext, log } = fakeAudio();
  createSound(FakeContext).play('wall');
  assert.ok(log.rampedTo > 0 && log.rampedTo < log.volume, `ramped to ${log.rampedTo}`);
});

test('an unknown note is ignored rather than played as something else', () => {
  const { FakeContext, log } = fakeAudio();
  assert.equal(createSound(FakeContext).play('explosion'), false);
  assert.equal(log.played.length, 0);
});

test('nothing is built until the first note is asked for', () => {
  // A browser will not let a page make noise before the visitor has
  // interacted with it, and a context built at load starts suspended and
  // stays that way.
  const { FakeContext, log } = fakeAudio();
  const sound = createSound(FakeContext);
  assert.equal(log.contexts, 0);

  sound.play('paddle');
  assert.equal(log.contexts, 1);
});

test('one context serves the whole match', () => {
  const { FakeContext, log } = fakeAudio();
  const sound = createSound(FakeContext);
  for (let i = 0; i < 50; i += 1) sound.play('paddle');
  assert.equal(log.contexts, 1);
  assert.equal(log.played.length, 50);
});

test('a suspended context is woken up', () => {
  const { FakeContext, log } = fakeAudio({ state: 'suspended' });
  createSound(FakeContext).play('point');
  assert.equal(log.resumed, 1);
});

/* --------------------------------------------------------------- muting -- */

test('muting silences everything', () => {
  const { FakeContext, log } = fakeAudio();
  const sound = createSound(FakeContext);
  sound.setMuted(true);

  for (const name of Object.keys(NOTES)) assert.equal(sound.play(name), false);
  assert.equal(log.played.length, 0);
});

test('muting while silent does not even build a context', () => {
  const { FakeContext, log } = fakeAudio();
  const sound = createSound(FakeContext);
  sound.setMuted(true);
  sound.play('paddle');
  assert.equal(log.contexts, 0);
});

test('unmuting brings it back', () => {
  const { FakeContext, log } = fakeAudio();
  const sound = createSound(FakeContext);
  sound.setMuted(true);
  sound.setMuted(false);
  sound.play('paddle');
  assert.equal(log.played.length, 1);
});

test('toggling reports where it ended up', () => {
  const sound = createSound(fakeAudio().FakeContext);
  assert.equal(sound.toggleMuted(), true);
  assert.equal(sound.muted, true);
  assert.equal(sound.toggleMuted(), false);
  assert.equal(sound.muted, false);
});

/* -------------------------------------------------- when there is no audio -- */

test('a browser with no Web Audio is a silent game, not a broken one', () => {
  const sound = createSound(undefined);
  for (const name of Object.keys(NOTES)) {
    assert.doesNotThrow(() => sound.play(name));
    assert.equal(sound.play(name), false);
  }
});

test('a context that refuses to be built is not retried every bounce', () => {
  // Fifty failed constructions a second is worse than silence.
  const { FakeContext, log } = fakeAudio({ failToConstruct: true });
  const sound = createSound(FakeContext);

  for (let i = 0; i < 20; i += 1) assert.equal(sound.play('paddle'), false);
  assert.equal(log.contexts, 0);
});

test('a refusal to build never reaches the caller', () => {
  const { FakeContext } = fakeAudio({ failToConstruct: true });
  assert.doesNotThrow(() => createSound(FakeContext).play('point'));
});
