# Blue Bay Golf Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for isolated renderer and camera tasks; the coordinating agent implements the shared golf simulation and application integration.

**Goal:** Deliver the complete nine-hole golf game in docs/golf-goal-prompt.md, preserving both input modes, customization and the approved visual direction.

**Architecture:** Pure JavaScript simulation and round state are independent of Three.js rendering and DOM menus. Keyboard and pose inputs produce the same normalized shot intent. A Web Worker runs MediaPipe inference; pose interpretation is independently testable.

**Tech Stack:** Vite, ES modules, Three.js, MediaPipe Tasks Vision, Node test runner, Playwright.

**Spec:** docs/golf-goal-prompt.md and the user-approved previews e-clean-gameplay.png and f-athletic-customization.png. Latest refinement: use the slimmer Cozy Club power meter, without a chunky navy container, retaining the bounded overhit section.

## Global Constraints

- Nine holes, solo and 2–4 local players, practice, tutorial, full menus and resumable local saves.
- Central 3D view contains no prediction graphics. All predicted range graphics live in the minimap.
- Both inputs share a bounded 0–120% power model; overhit remains inside the slim cream-framed meter.
- Camera frames are never recorded or uploaded. Stop capture on exit/disable. Tracking failure cannot fire a shot.
- Six editable athletic character presets, relaxed/sharp face treatments, shared in preview and gameplay.
- Distinguish actual camera verification from synthetic landmark testing.

## Task 1 — Simulation and persisted round state

Files: src/game/courses.js, src/game/physics.js, src/game/round.js, src/game/profiles.js, src/game/storage.js; tests/game.test.js.

Interfaces: point `{x,z}` in yards; hole `{id,name,par,length,tee,pin,path,width,greenRadius,bunkers,ponds,wind}`; `simulateShot({hole,start,club,power,aim,accuracy=0}) -> {path,landing,end,carry,total,penalty,holed,lie}`. `createRound(players,holes,practice)`, `applyShot(round,result)`, `nextHole(round)`. Profiles contain id,name,skin,hair,hairStyle,face,build,top,bottom,outfit,hat,accessory.

- [x] Write independent behavioral tests for power saturation, club differences, water/OOB, putting capture, multiplayer turn order and nine-hole completion.
- [x] Run `npm test`, observe missing implementation failures, implement modules and pass tests.
- [x] Add local schema validation and safe corrupt-save fallback; verify round and profile persistence.

## Task 2 — Course renderer and athletic golfers

Files owned by renderer worker: src/render/scene.js, src/render/avatar.js, src/render/environment.js. Consume the hole and profile contracts above.

Interface: `new GolfScene(canvas, {onError})`, `.setHole(hole)`, `.setPlayer(profile)`, `.setBall(point)`, `.setAim(radians)`, `.orbit(dx,dy)`, `.resetView()`, `.setMode('menu'|'play'|'avatar')`, `.setQuality('low'|'medium'|'high')`, `.setReducedMotion(bool)`, `.animateShot(result,onComplete)`, `.update(dt)`, `.resize()`, `.dispose()`. Avatar export `createAvatar(profile)` returns Group with `.userData.animate(t,kind)` for idle/swing/celebration.

- [x] Build sunny sculpted coastal terrain matching hole geometry, ocean, sand, palms, course furniture, distant islands and lighthouse.
- [x] Build original athletic modular avatar with diverse hair and body options; keep joints available for animation.
- [x] Render actual ball trajectory and camera follow during shots, without displaying prediction lines on course.
- [x] Validate with a browser screenshot and inspect geometry/resource lifecycle.

## Task 3 — Camera input

Files owned by camera worker: src/input/gesture.js, src/input/camera.js, src/input/pose.worker.js; tests/gesture.test.js.

Interface: `new CameraController({onStatus,onLandmarks,onSwing})`; `.start(video,{deviceId,handedness,sensitivity,reducedMotion}) -> Promise`, `.calibrate()`, `.setOptions(options)`, `.setArmed(bool)`, `.stop()`, `.listDevices()`. Status callback `{state,message,confidence,calibrated,phase}`. Swing callback `{power}` (0–1.2). Tests import gesture interpreter directly.

- [x] Failing tests: one swing/one event, cooldown, occlusion never fires, left-handed/reduced-motion handling, calibrated normalized power.
- [x] Implement pose worker loading local WASM/model files, frame transfer at bounded rate, and errors with retry support.
- [x] Implement lifecycle cleanup, permission/device errors, visible calibration progress and practice mode.
- [x] Verify synthetic sequences and camera-denied browser flow; document real-device validation limits.

## Task 4 — Full application and interface

Files: index.html, src/main.js, src/ui/screens.js, src/ui/minimap.js, src/ui/styles.css, src/audio.js.

- [x] Write browser checks for title/setup/customizer/settings/tutorial/gameplay/navigation/pause flows.
- [x] Implement original coastal title screen, roster/turn-based setup, six editable saved presets and live avatar preview.
- [x] Implement the compact top metrics, minimap with synchronized power/club/aim preview, slim bounded Cozy-style meter, cream club selector, independent orbit, keyboard access and charge/release swing.
- [x] Implement camera setup with device selection, preview, framing instructions, handedness/sensitivity/calibration, tracking state and retry/switch controls.
- [x] Implement practice and full/selected hole play, scorecard/results, audio, graphics, reduced motion, persistence, replay/restart/menu paths.

## Task 5 — Verification, refinement and delivery

- [x] Run unit tests and production build, resolve failures using concrete reproductions.
- [x] Run Playwright browser navigation and full-round checks against actual app state, inspect screenshots at desktop and smaller laptop widths.
- [x] Review code and audit every spec requirement. Fix material gaps before claiming completion.
- [x] Document run instructions, measured performance/browser environment and hardware-dependent camera limitations.
- [x] Commit and push to user-provided origin; keep scope active until the complete implementation and verification are done.
