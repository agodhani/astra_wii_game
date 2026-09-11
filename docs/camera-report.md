# Camera swing subsystem

## Public API

`src/input/camera.js` exports `CameraController`:

```js
const camera = new CameraController({ onStatus, onLandmarks, onSwing });

await camera.start(videoElement, {
  deviceId: '',
  handedness: 'right', // or 'left'
  sensitivity: 1,     // clamped to 0.5–2
  reducedMotion: false,
});

camera.calibrate();
camera.setOptions({ handedness, sensitivity, reducedMotion });
camera.setArmed(true);
camera.stop();
await camera.listDevices();
camera.getState();
```

`onStatus` receives at least `{state, message, confidence, calibrated, phase}`. It also receives `calibrationProgress`, `lastPower`, and `armed` for the setup and practice UI. Controller states are `idle`, `requesting`, `ready`, `calibrating`, `tracking`, `tracking-lost`, and `error`. Gesture phases are `uncalibrated`, `calibrating`, `rest`, `backswing`, `forward`, `cooldown`, and `tracking-lost`.

`onLandmarks` receives the first detected pose's normalized landmarks, or `null` when no pose is found. `onSwing` receives `{power}` in the inclusive range 0–1.2. A recognized swing updates status and `lastPower` while unarmed; it calls `onSwing` only while armed.

`src/input/gesture.js` also exports `GestureInterpreter` and `createGestureInterpreter(options)` for deterministic landmark interpretation.

## Detection model

Calibration requires 20 consecutive stable frames by default. It records the comfortable horizontal arm position relative to the shoulder midpoint. Large movement restarts the stable sample run instead of calibrating across unrelated poses.

The interpreter requires visible shoulders, elbows, and wrists at a minimum confidence of 0.55. It blends wrist and elbow motion and divides it by the current shoulder width, which reduces sensitivity to the person's size in the frame. Handedness selects motion direction using the detected left/right shoulder layout, so the live preview may be mirrored with CSS without modifying inference frames.

A shot must progress through rest, backswing, forward swing, and cooldown. Two valid address frames arm the gesture. Tracking loss, non-finite landmark coordinates, or an expired partial swing cancels it and requires a new address pose. Cooldown prevents repeated follow-through frames from producing extra events. Reduced-motion mode uses smaller travel and speed thresholds. The resulting arcade power estimate combines normalized arm travel and forward speed and saturates at 1.2.

This is a forgiving motion-sports gesture. It does not measure clubhead speed, club-face angle, ball spin, or the physics of a real golf swing.

## Capture and lifecycle

Camera permission is requested only by `start()`, so the application should call it from the player's explicit Enable Camera action. The selected `deviceId` uses an exact constraint; an empty ID uses the browser's default user-facing camera. Permission denial, missing or busy cameras, unavailable selected devices, disconnection, model failure, worker failure, and repeated frame-read failure produce actionable error status.

Inference runs in a module Web Worker with MediaPipe Tasks Vision. The controller transfers an `ImageBitmap` at no more than 15 frames per second and permits only one inference request in flight. Frames are neither recorded nor uploaded. `stop()`, a retrying `start()`, and fatal errors cancel animation work, reject pending model initialization, stop every media track, terminate the worker, and clear `video.srcObject`. Generation checks discard late results from superseded starts.

The parent UI should mirror only the video presentation, for example with `transform: scaleX(-1)`. It should call `stop()` whenever camera mode or the game is exited, and set armed state only while the current player is allowed to take a shot.

## Local assets

The worker loads these same-origin files:

- `public/models/pose_landmarker_lite.task`
- `public/mediapipe/wasm/vision_wasm_internal.mjs` (generated ES-module wrapper)
- `public/mediapipe/wasm/vision_wasm_internal.wasm`
- `public/mediapipe/wasm/vision_wasm_nosimd_internal.mjs` (generated ES-module wrapper)
- `public/mediapipe/wasm/vision_wasm_nosimd_internal.wasm`

The dependency is `@mediapipe/tasks-vision` 0.10.32. Model or WASM loading errors are reported as failures; there is no synthetic success fallback. The worker tries GPU inference first and retries model creation with CPU inference if the GPU delegate is unavailable.

## Validation

Run the focused tests with the repository's Node 24 runtime:

```sh
node --test --test-isolation=none tests/gesture.test.js
```

The 11 deterministic tests use hand-derived MediaPipe-shaped landmark sequences. They cover one event per swing, phase transitions and cooldown, repeat swings after rearming, normalized scale, mirrored handedness, confidence loss, tracking-loss recovery, reduced-motion gestures, the 1.2 cap, stable calibration, invalid coordinates, abandoned-swing expiry, and stop during pending worker initialization. The camera entry and worker also bundle through Vite with the local MediaPipe package.

Real webcam framing, browser permission UI, model initialization, and gesture comfort depend on browser and hardware. They were not verified with physical camera hardware in this environment. Test in a current Chrome or Edge secure context on the target laptop, first with practice mode, and tune sensitivity per player. The player must keep shoulders, elbows, and both wrists visible; occlusion deliberately cancels the swing. Aim and club selection remain keyboard/mouse controls.

## Production browser verification — 2026-09-11

Both targeted camera browser tests passed (24.6 seconds total). The unavailable-camera test preserves the round and keyboard controls. The synthetic video-device test loads the actual local model and WASM, waits for a real inference result, refuses calibration without a visible golfer, and verifies every capture track stops on keyboard fallback.

The MediaPipe classic-script loader is exposed as an ES module by the asset preparation script. It adds the supported `dbg` logger binding because the upstream fallback logger relies on sloppy-mode function hoisting. Both SIMD and non-SIMD wrappers receive the same adaptation. WASM binaries and the upstream loader body are unchanged.

First inference under SwiftShader took about 10 seconds while shaders compiled, so the browser check allows 25 seconds for the first result. This is distinct from physical-camera testing and typical hardware-GPU latency.
