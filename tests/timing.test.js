/**
 * timing.test.js — how much simulation one animation frame is worth.
 *
 * The loop ran exactly one step per frame, so the speed of the game was the
 * refresh rate of the screen. On a 60Hz laptop it is a rally; on a 144Hz
 * monitor the same code is nearly two and a half times faster and unplayable,
 * and nothing anywhere says so.
 *
 * planSteps is the whole fix, and it is a pure function of two numbers, so
 * every display and every stall is just an argument.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { TIMING, planSteps } = require('../engine.js');

const HZ_60 = 1000 / 60;
const HZ_144 = 1000 / 144;

/* ------------------------------------------------------- the common case -- */

test('a 60Hz frame is worth one step', () => {
  assert.equal(planSteps(HZ_60, 0).steps, 1);
});

test('a 144Hz frame is usually worth nothing, and sometimes worth one', () => {
  // Which is the point: the extra frames are drawn, not simulated.
  let carry = 0;
  const counts = [];
  for (let i = 0; i < 144; i += 1) {
    const plan = planSteps(HZ_144, carry);
    carry = plan.carry;
    counts.push(plan.steps);
  }
  assert.ok(counts.includes(0), 'every frame ran a step');
  assert.ok(counts.includes(1), 'no frame ever ran a step');
});

test('a second of real time is a second of game, at any refresh rate', () => {
  const stepsInOneSecond = (frameMs) => {
    let carry = 0;
    let steps = 0;
    for (let t = 0; t < 1000; t += frameMs) {
      const plan = planSteps(frameMs, carry);
      carry = plan.carry;
      steps += plan.steps;
    }
    return steps;
  };

  for (const hz of [30, 60, 75, 120, 144, 240]) {
    const steps = stepsInOneSecond(1000 / hz);
    assert.ok(
      Math.abs(steps - 60) <= 1,
      `${hz}Hz ran ${steps} steps in a second, not 60`,
    );
  }
});

test('the leftover milliseconds are kept, not dropped', () => {
  // Dropping them is how 144Hz ends up slower than 60Hz instead of equal: a
  // frame shorter than a step would count for nothing at all, forever.
  const plan = planSteps(HZ_144, 0);
  assert.equal(plan.steps, 0);
  assert.ok(plan.carry > 0, 'the frame vanished');
  assert.equal(planSteps(HZ_144, plan.carry).carry > plan.carry, true);
});

test('carried time can push a frame over the line into a step', () => {
  const almost = TIMING.stepMs - 1;
  assert.equal(planSteps(1, 0).steps, 0);
  assert.equal(planSteps(1, almost).steps, 1);
});

/* ------------------------------------------------------------- the cap -- */

test('a long stall runs the cap, not the whole gap', () => {
  // A backgrounded tab gets no frames, then one carrying ten seconds. Without
  // the cap that is 600 steps in a row and the ball crosses the field several
  // times over, through both paddles, before anything is drawn.
  const plan = planSteps(10_000, 0);
  assert.equal(plan.steps, TIMING.maxStepsPerFrame);
});

test('the time beyond the cap is thrown away, not owed', () => {
  // Carrying it makes the next frame late as well, and the one after that,
  // and the game never catches up with itself again.
  assert.equal(planSteps(10_000, 0).carry, 0);
  const after = planSteps(HZ_60, planSteps(10_000, 0).carry);
  assert.equal(after.steps, 1);
});

/* ------------------------------------------------ the clock misbehaving -- */

test('the first frame, with no previous timestamp, runs nothing', () => {
  assert.equal(planSteps(0, 0).steps, 0);
});

test('a clock that goes backwards does not run negative steps', () => {
  const plan = planSteps(-500, 4);
  assert.equal(plan.steps, 0);
  assert.equal(plan.carry, 4, 'the carried time was lost');
});

test('a timestamp that is not a number leaves the clock where it was', () => {
  for (const bad of [NaN, undefined, null, Infinity]) {
    const plan = planSteps(bad, 7);
    assert.equal(plan.steps, 0, `elapsed ${String(bad)} ran steps`);
    assert.equal(plan.carry, 7, `elapsed ${String(bad)} ate the carry`);
  }
});

test('nonsense carried in from a previous frame is discarded, not spread', () => {
  const plan = planSteps(HZ_60, NaN);
  assert.equal(plan.steps, 1);
  assert.ok(Number.isFinite(plan.carry), 'NaN carried into the next frame');
});

test('the carry never grows without bound', () => {
  let carry = 0;
  for (let i = 0; i < 10_000; i += 1) carry = planSteps(HZ_144, carry).carry;
  assert.ok(carry < TIMING.stepMs, `carry drifted to ${carry}`);
});
