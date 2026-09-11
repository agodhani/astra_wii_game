import test from 'node:test';
import assert from 'node:assert/strict';
import { GestureInterpreter } from '../src/input/gesture.js';
import { CameraController } from '../src/input/camera.js';

const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_ELBOW = 13;
const RIGHT_ELBOW = 14;
const LEFT_WRIST = 15;
const RIGHT_WRIST = 16;

function pose(side = 0, {
  handedness = 'right',
  shoulderWidth = 0.2,
  confidence = 0.98,
} = {}) {
  const points = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: confidence,
    presence: confidence,
  }));
  const direction = handedness === 'right' ? -1 : 1;
  const wristX = 0.5 + side * shoulderWidth * direction;
  const elbowX = 0.5 + side * shoulderWidth * direction * 0.55;

  points[LEFT_SHOULDER] = { ...points[LEFT_SHOULDER], x: 0.5 + shoulderWidth / 2, y: 0.3 };
  points[RIGHT_SHOULDER] = { ...points[RIGHT_SHOULDER], x: 0.5 - shoulderWidth / 2, y: 0.3 };
  points[LEFT_ELBOW] = { ...points[LEFT_ELBOW], x: elbowX, y: 0.46 };
  points[RIGHT_ELBOW] = { ...points[RIGHT_ELBOW], x: elbowX, y: 0.46 };
  points[LEFT_WRIST] = { ...points[LEFT_WRIST], x: wristX, y: 0.62 };
  points[RIGHT_WRIST] = { ...points[RIGHT_WRIST], x: wristX, y: 0.62 };
  return points;
}

function calibratedInterpreter(options = {}) {
  const interpreter = new GestureInterpreter({ calibrationSamples: 6, ...options });
  interpreter.beginCalibration();
  let result;
  for (let index = 0; index < 6; index += 1) {
    result = interpreter.update(pose(0, options), index * 20);
  }
  assert.equal(result.calibrated, true, 'fixture must produce a completed calibration');
  return interpreter;
}

function run(interpreter, sides, {
  start = 200,
  step = 45,
  poseOptions = {},
} = {}) {
  return sides.map((side, index) => interpreter.update(
    pose(side, poseOptions),
    start + index * step,
  ));
}

test('an intentional swing crosses each phase and emits exactly one event through cooldown', () => {
  const interpreter = calibratedInterpreter();
  const results = run(interpreter, [0, 0.1, 0.7, 1.05, 0.72, 0.18, -0.38, -0.72, -0.8, -0.5]);

  assert.deepEqual(
    results.filter((result) => result.swing).map((result) => result.swing.power).length,
    1,
  );
  assert.ok(results.some((result) => result.phase === 'backswing'));
  assert.ok(results.some((result) => result.phase === 'forward'));
  assert.equal(results.at(-1).phase, 'cooldown');
  assert.ok(results.find((result) => result.swing).swing.power > 0.65);

  const afterCooldown = run(interpreter, [0, 0, 0.72, 1.0, 0.5, -0.4], { start: 1700 });
  assert.equal(afterCooldown.filter((result) => result.swing).length, 1);
});

test('shoulder normalization gives similar power for the same motion at different image scales', () => {
  const near = calibratedInterpreter({ shoulderWidth: 0.32 });
  const far = calibratedInterpreter({ shoulderWidth: 0.16 });
  const sides = [0, 0, 0.65, 1.0, 0.65, 0.05, -0.5];
  const nearPower = run(near, sides, { poseOptions: { shoulderWidth: 0.32 } }).find((result) => result.swing).swing.power;
  const farPower = run(far, sides, { poseOptions: { shoulderWidth: 0.16 } }).find((result) => result.swing).swing.power;

  assert.ok(Math.abs(nearPower - farPower) < 0.03, `${nearPower} should be close to ${farPower}`);
});

test('mirrored left and right handed swings produce equivalent power', () => {
  const right = calibratedInterpreter({ handedness: 'right' });
  const left = calibratedInterpreter({ handedness: 'left' });
  const sides = [0, 0.08, 0.68, 1.02, 0.62, 0, -0.52];
  const rightPower = run(right, sides, { poseOptions: { handedness: 'right' } }).find((result) => result.swing).swing.power;
  const leftPower = run(left, sides, { poseOptions: { handedness: 'left' } }).find((result) => result.swing).swing.power;

  assert.equal(leftPower, rightPower);
});

test('tracking loss cancels a partial swing and recovered follow-through cannot fire', () => {
  const interpreter = calibratedInterpreter();
  run(interpreter, [0, 0, 0.72, 1.0]);
  const lost = interpreter.update(pose(1.0, { confidence: 0.2 }), 400);
  const recoveredInFollowThrough = run(interpreter, [-0.1, -0.6, -0.8], { start: 450 });

  assert.equal(lost.phase, 'tracking-lost');
  assert.equal(recoveredInFollowThrough.filter((result) => result.swing).length, 0);

  const freshSwing = run(interpreter, [0, 0, 0.7, 1, 0.5, -0.5], { start: 900 });
  assert.equal(freshSwing.filter((result) => result.swing).length, 1);
});

test('reduced-motion mode recognizes a deliberate smaller gesture', () => {
  const standard = calibratedInterpreter();
  const reduced = calibratedInterpreter({ reducedMotion: true });
  const compactSwing = [0, 0, 0.34, 0.48, 0.2, -0.12, -0.3];

  assert.equal(run(standard, compactSwing).filter((result) => result.swing).length, 0);
  assert.equal(run(reduced, compactSwing).filter((result) => result.swing).length, 1);
});

test('low-confidence landmarks never trigger a swing', () => {
  const interpreter = calibratedInterpreter();
  const results = run(interpreter, [0, 0.8, 1.2, 0.2, -0.8], {
    poseOptions: { confidence: 0.35 },
  });

  assert.equal(results.filter((result) => result.swing).length, 0);
  assert.ok(results.every((result) => result.confidence < 0.55));
});

test('extreme wrist speed and travel saturate power at the 120 percent cap', () => {
  const interpreter = calibratedInterpreter({ sensitivity: 2 });
  const results = run(interpreter, [0, 0, 1.4, 2.8, -2.5], { step: 16 });
  const event = results.find((result) => result.swing);

  assert.ok(event, 'strong valid swing should emit');
  assert.equal(event.swing.power, 1.2);
});

test('calibration completes only after a stable run of address-pose samples', () => {
  const interpreter = new GestureInterpreter({ calibrationSamples: 4 });
  interpreter.beginCalibration();
  const moving = [0, 0.45, -0.4, 0.35].map((side, index) => (
    interpreter.update(pose(side), index * 20)
  ));

  assert.ok(moving.every((result) => result.calibrated === false));
  assert.ok(moving.at(-1).calibrationProgress <= 0.5);

  const stable = [0.1, 0.1, 0.1, 0.1].map((side, index) => (
    interpreter.update(pose(side), 200 + index * 20)
  ));
  assert.equal(stable.at(-1).calibrated, true);
});

test('non-finite arm coordinates count as tracking loss and cancel a partial swing', () => {
  const interpreter = calibratedInterpreter();
  run(interpreter, [0, 0, 0.7, 1]);
  const malformed = pose(1);
  malformed[LEFT_WRIST].x = Number.NaN;
  const lost = interpreter.update(malformed, 410);
  const recovered = run(interpreter, [-0.2, -0.7], { start: 460 });

  assert.equal(lost.confidence, 0);
  assert.equal(lost.phase, 'tracking-lost');
  assert.equal(recovered.filter((result) => result.swing).length, 0);
});

test('an abandoned backswing expires before later arm motion can fire', () => {
  const interpreter = calibratedInterpreter();
  run(interpreter, [0, 0, 0.72, 1], { start: 200 });

  const expired = interpreter.update(pose(0.8), 1800);
  const strayFollowThrough = interpreter.update(pose(-0.7), 1850);
  assert.equal(expired.phase, 'rest');
  assert.equal(strayFollowThrough.swing, null);

  const freshSwing = run(interpreter, [0, 0, 0.72, 1, 0.5, -0.5], { start: 2200 });
  assert.equal(freshSwing.filter((result) => result.swing).length, 1);
});

test('stopping during model initialization promptly rejects start and releases camera resources', async () => {
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const workerDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  let workerInstance;
  let trackStopped = false;
  const track = {
    addEventListener() {},
    removeEventListener() {},
    stop() { trackStopped = true; },
  };
  class PendingWorker {
    constructor() {
      workerInstance = this;
      this.terminated = false;
    }
    postMessage() {}
    terminate() { this.terminated = true; }
  }
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      mediaDevices: {
        getUserMedia: async () => ({
          getTracks: () => [track],
          getVideoTracks: () => [track],
        }),
      },
    },
  });
  Object.defineProperty(globalThis, 'Worker', { configurable: true, value: PendingWorker });

  const video = {
    srcObject: null,
    async play() {},
    pause() {},
    setAttribute() {},
  };
  const controller = new CameraController();
  const starting = controller.start(video);
  await new Promise((resolve) => setImmediate(resolve));
  controller.stop();

  try {
    const outcome = await Promise.race([
      starting.then(
        () => ({ resolved: true }),
        (error) => ({ error }),
      ),
      new Promise((resolve) => setTimeout(() => resolve({ pending: true }), 40)),
    ]);
    assert.equal(outcome.pending, undefined, 'start must not remain pending after stop');
    assert.equal(outcome.error?.name, 'AbortError');
    assert.equal(trackStopped, true);
    assert.equal(workerInstance.terminated, true);
  } finally {
    workerInstance.onerror?.({ message: 'test cleanup' });
    await starting.catch(() => {});
    if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
    else delete globalThis.navigator;
    if (workerDescriptor) Object.defineProperty(globalThis, 'Worker', workerDescriptor);
    else delete globalThis.Worker;
  }
});
