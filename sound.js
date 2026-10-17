/**
 * sound.js — the three noises Pong makes.
 *
 * Synthesised, not loaded. Three short square-wave blips need no files, no
 * fetch and no decoding, which means no second request that can fail and
 * nothing to go stale in a cache. The whole thing is about forty lines.
 *
 * Nothing here is created until the first note is asked for. A browser will
 * not let a page make noise before the visitor has interacted with it, and an
 * AudioContext built at load starts suspended and stays that way — so it is
 * built on the first keypress instead, when it is allowed to run.
 */

(function () {
  /** Pitch and length of each event, in hertz and seconds. */
  const NOTES = {
    // Up the field: the paddle is the brighter, shorter sound.
    paddle: { hz: 440, seconds: 0.05 },
    wall: { hz: 240, seconds: 0.04 },
    // Lower and longer, because a point is the one worth hearing from the
    // next room.
    point: { hz: 150, seconds: 0.22 },
  };

  const VOLUME = 0.08;

  function createSound(AudioContextClass = globalThis.AudioContext) {
    let context = null;
    let muted = false;

    /** Build the context on first use, when the browser will let it run. */
    function ensure() {
      if (!AudioContextClass) return null;
      if (!context) {
        try {
          context = new AudioContextClass();
        } catch {
          // No audio on this device, or the page is not allowed any. The game
          // is entirely playable without it, so this is not worth reporting.
          AudioContextClass = null;
          return null;
        }
      }
      if (context.state === 'suspended' && context.resume) context.resume();
      return context;
    }

    function play(name) {
      const note = NOTES[name];
      if (!note || muted) return false;

      const ctx = ensure();
      if (!ctx) return false;

      const now = ctx.currentTime;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.type = 'square';
      oscillator.frequency.value = note.hz;

      // Ramped down rather than stopped flat: an abruptly cut waveform clicks,
      // and a click on every bounce is worse than no sound at all.
      gain.gain.setValueAtTime(VOLUME, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + note.seconds);

      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(now);
      oscillator.stop(now + note.seconds);
      return true;
    }

    return {
      play,
      get muted() {
        return muted;
      },
      setMuted(value) {
        muted = Boolean(value);
        return muted;
      },
      toggleMuted() {
        return this.setMuted(!muted);
      },
      NOTES,
    };
  }

  const SOUND = { createSound, NOTES, VOLUME };

  if (typeof window !== 'undefined') window.SOUND = SOUND;
  if (typeof module !== 'undefined' && module.exports) module.exports = SOUND;
})();
