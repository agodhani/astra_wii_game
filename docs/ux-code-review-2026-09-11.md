**Blue Bay Golf — laptop experience and code review**

Reviewed September 11, 2026, against commit `4e516bc`. Keyboard/trackpad play and webcam swings have equal product importance, as confirmed during this review. This is an analysis and recommended sequence of work; game behavior has not been changed.

The strongest direction is approachable golf with satisfying shot decisions, expressive swings, and quick sessions. The current game has enough features to pursue that direction. The largest opportunities are preserving player progress, making both inputs dependable, improving the short game, and creating room for mastery. Expanding the roster, course count, or menu system would have less immediate value.

There is a useful foundation to preserve: a coherent coastal setting, complete round progression, local multiplayer, editable golfers, independent camera orbit, shared prediction/shot physics, bounded power, and camera processing in a worker. The original requirement to keep predictions inside the minimap still makes sense; the minimap needs to adapt to the shot.

**Evidence and limits.** The current 31 unit tests and seven production-browser tests passed during this review. Additional browser probes exercised saved-round recovery, a held Swing button, customization focus, putting at 1280 × 720, and round selection. A separate simulation experiment played 100 complete nine-hole rounds. Physical webcam swing comfort and performance on a target laptop GPU were not verified. The browser used Chromium with SwiftShader; screenshots and automated checks establish behavior and layout, not hardware frame rate or human enjoyment.

| Priority | Finding | Player impact | Recommended change |
|---|---|---|---|
| P0 | Practice replaces the resumable round | A player loses an unfinished round simply by practicing | Keep practice transient or in a separate save slot |
| P1 | Camera calibration is discarded at hole and player transitions | Repeated setup interrupts the main attraction | Preserve session calibration and separate it from capture/model lifetime |
| P1 | Camera gestures cannot produce the full low-power range | Gentle chips and putts lack adequate control | Calibrate comfortable motion range and validate short-shot mapping |
| P1 | Click and hold share an abrupt 180 ms boundary | A slightly longer press can turn an 85% shot into a very weak shot | Give Swing stable semantics and make charging deliberate |
| P1 | Putting remains on a whole-hole minimap | Ball, target, and power markers overlap when precision matters | Add a green-scale minimap view, short-distance units, and slope information |
| P1 | Default assistance largely solves the course | Players have little reason to improve aim, power, or club decisions | Tune assistance and course choices through playtesting |
| P1 | Full screen replacement loses keyboard focus | Keyboard customization and navigation repeatedly restart | Preserve focus and update only the changed UI region |
| P1 validation | Laptop performance is not established | Camera and rendering may compete for resources; battery cost is unknown | Profile both modes on actual integrated-GPU laptops |
| P2 | Club identity and result feedback are weak | Drives, chips, and putts feel too similar | Distinct short-shot animation, contact audio, and useful result feedback |
| P2 | Onboarding and practice teach through text and repeated tee shots | Players have few opportunities to learn the short game | Teach one drive, approach, and putt through the existing practice flow |

1. **Protect progress before adding features.**

   In the browser, a saved round on hole four was replaced immediately after clicking Practice range. Save & exit followed by Resume round returned to practice on hole one. [`startRound`](../src/main.js) assigns both activities to `round` and saves them into the same field; see `src/main.js:75–79` and `src/main.js:26`.

   Practice should preserve the active round without requiring a warning dialog. Starting a replacement scored round should communicate what will be replaced. Existing restart confirmation does not cover the practice case.

2. **Make webcam play a continuous experience.**

   [`main.js`](../src/main.js) calls `camera.stop()` when the active golfer changes (`142`) and on every Next hole (`174`). [`CameraController.stop`](../src/input/camera.js) clears calibration, terminates the worker, and stops capture (`185–196`, `368–395`). Returning to gameplay consequently opens setup again. This is a code-confirmed lifecycle issue, independent of physical tracking quality.

   Keep a calibrated session across holes for the same golfer and unchanged setup. For multiplayer, associate handedness, comfort settings, and calibration with the golfer, then check framing on handoff. Camera capture should still stop when camera mode is disabled or the player leaves the game. A calibration snapshot and a running camera are separate concerns.

   Standing play also needs a large, persistent Ready / Practice / Swing captured indicator and audible readiness feedback. The current live badge uses very small text, while the player must repeatedly approach the laptop to aim and change clubs. Improve that transition first; introducing gesture controls for every menu would add recognition complexity before the main swing is reliable.

3. **Give camera players a usable short game.**

   Calibration currently records a resting horizontal arm position, rather than the player's comfortable swing range. The backswing, follow-through, and speed thresholds in [`gesture.js`](../src/input/gesture.js) (`206–249`) imply a minimum recognized power of approximately `44.87%`. A synthetic sweep of 36 motion/timing combinations recognized 17 and produced a lowest power of `46.4%`; this is a diagnostic experiment, not a recognition-rate estimate for humans. The analytic lower bound corresponds to roughly 4.8 yards of unobstructed roll with the current putter on a flat green. Cup capture makes some shorter putts possible, but it does not restore fine power control.

   Calibrate a few comfortable strokes and establish a controllable short-shot mapping, with a clear distinction between full swings and putting. Test soft, medium, and strong shots with several players before tuning fixed constants. Preserve confidence gating, cancellation, cooldown, and the shared 120% cap.

   There is also a feedback defect: the live swing callback disarms the camera before `_reportGesture` reads `this.armed`. A captured live shot can therefore be labeled “Practice swing.” A controller-level reproduction confirmed this. Preserve whether the event was live when it was accepted; see `src/input/camera.js:264–267` and `282–286`.

4. **Remove ambiguity from keyboard and trackpad swings.**

   [`releaseCharge`](../src/main.js) uses planned power for presses shorter than 180 ms, then switches to elapsed time divided by 1800. With 85% selected, a browser press held for about 225 ms fired at `12.6%`. The charge display also begins changing before the click/hold decision is resolved (`152–153`, `243–244`). This creates an avoidable timing trap for trackpad users.

   Give the primary Swing action one predictable meaning. If hold charging remains, expose it deliberately, indicate when charging begins, and offer a clear cancellation path. Keep click/keyboard activation consistent. Do not add several competing timing systems before choosing and playtesting the core interaction.

5. **Treat putting as a distinct visual and control situation.**

   [`drawMinimap`](../src/ui/minimap.js) derives scale from the entire hole length (`39–44`). At 1280 × 720, the map canvas is displayed at 146 × 219 pixels. On hole nine, a six-yard putt spans only about **2.3 screen pixels**, smaller than its markers. The browser screenshot confirmed that the important markers overlap. Several supporting labels render at 7–9 px.

   Keep the course view clear and switch the minimap to a local green view for short shots, with an easy overview toggle. Show feet or another clearly labeled short-distance scale, readable slope direction, and a useful stopping region. For a putt, replace the redundant “Est. carry: 0 yd” with information that helps the decision. Add fine aim/power adjustment and a compact putting camera/animation.

6. **Create meaningful mastery while preserving forgiveness.**

   A reproducible simulation used seed `12345`, the existing linear congruential generator formula `seed = (seed * 1664525 + 1013904223) >>> 0`, the current recommended club, automatic aim directly at the pin, unchanged 85% power, and the game's normal randomized accuracy input for every shot. It completed 100 nine-hole rounds with these results:

   | Metric | Result |
   |---|---:|
   | Course par | 35 |
   | Average score | 27.28 |
   | Lowest / highest score | 26 / 32 |
   | Rounds under par | 100 / 100 |
   | First round, by hole | 3, 1, 3, 4, 2, 6, 4, 2, 4 |

   This is equivalent to a policy that repeatedly activates the planned-power shot without changing aim, club, or power. It is evidence of generous assistance, not a human playtest. Automatic re-aiming and club choice are in `src/main.js:145–146`; cup capture in [`physics.js`](../src/game/physics.js) uses a generous 1.55-world-unit radius for sufficiently slow balls (`52–57`). The greens also share the same central slope formula in [`courses.js`](../src/game/courses.js).

   Preserve an approachable assisted experience, then playtest whether reduced assistance and a few clearer risk/reward decisions improve engagement. Make good planning and deliberate execution matter. Use selected existing holes to test a safe layup, a rewarding aggressive line, and a readable breaking putt. Avoid increasing random misses as a substitute for skill or building an elaborate difficulty framework at this stage.

7. **Preserve focus and make the HUD readable at laptop distances.**

   [`render`](../src/main.js) replaces `app.innerHTML` (`37–60`). In a browser keyboard flow, selecting Sharp in the creator moved focus to `BODY`; the next Tab returned to Back. Closing Pause also lost focus. The existing focus outline and partial modal Tab trap are useful, but dialogs have no dialog semantics and the background is not inert.

   Keep the selected control focused across updates, restore focus when closing overlays, and use appropriate dialog semantics and background isolation. Provide a focusable gameplay surface. Increase important hints and camera status text, and enlarge the usable hit region around the slim power meter without making the visible meter bulky. W3C's minimum pointer-target guidance is 24 × 24 CSS pixels, with spacing and other exceptions; larger targets are appropriate for frequent trackpad actions. This is a design recommendation, not a completed accessibility conformance audit. [W3C target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

   Round setup has a smaller clarity issue: selecting a hole silently switches a previously selected three- or nine-hole round to single-hole mode. The browser reproduced this. Show the hole picker when Choose a hole is active, or make the resulting round explicit beside Tee off.

8. **Improve the feedback that makes shots feel like golf.**

   The avatar currently uses one club model and full-swing animation across all clubs (`src/render/avatar.js:147–170`). The renderer does not receive the selected club for animation. Shot audio starts at command acceptance (`src/main.js:134`), while the ball launches later in the swing animation (`src/render/scene.js:97–101`); landing audio happens at shot completion.

   Start with distinct drive, chip, and putt motions; synchronize contact sound with contact; and distinguish sand, turf, water, and cup feedback. Show a concise result containing actual power, carry/roll, and remaining distance, with relevant explanations such as a rough lie or penalty. In local play, briefly announce the next golfer so handoffs are unambiguous. A fast-forward option for long shot playback can improve session pace.

   Replace the five text-only tutorial cards with a few contextual steps in the existing practice flow. Add reusable drive, chip, and putt starting positions. These changes teach the core systems without requiring a separate training platform or progression economy.

**Code simplification should support these fixes.** Two production dependencies—Three.js and MediaPipe—are reasonable for this product. The code is already separated into simulation, rendering, input, and UI modules. Its main maintainability problem is compressed source and orchestration spread across mutable flags, rather than too many frameworks.

| Change | Reason and scope |
|---|---|
| Format source consistently | `screens.js` puts substantial screen templates on single lines, and the CSS is compressed into six lines. Readability will make behavior changes and review safer. |
| Extract a small set of session transitions from `main.js` | Make entering practice, finishing a shot, changing golfers, and opening/closing overlays explicit. Keep the existing pure round functions; a new state-management framework is unnecessary. |
| Update individual UI regions | Fix focus loss and eliminate needless rebuilding of the entire HUD or editor. Split large screen templates along existing screen boundaries as they are touched. |
| Reuse the current avatar between shots | `main.js:143` calls `setPlayer` after every shot, and `scene.js:35–37` disposes/recreates it even for the same golfer. Rebuild only when the golfer or appearance changes. |
| Route each setting to the affected subsystem | Every settings input currently calls `setQuality`, which disposes the shadow map. Moving a sound slider should not rebuild graphics resources (`main.js:195`, `scene.js:65–70`). |
| Remove confirmed unused items | Candidates include `editOriginal`, the minimap's `terrainHeight` import, `smooth` in the environment module, `GolfAudio.notes`, and the unused `createGestureInterpreter` factory. These are small cleanup items. |
| Keep test artifacts out of normal source updates | A browser test rewrites tracked verification screenshots on every run. Write routine captures to the test output directory; update curated screenshots explicitly. The screenshot regenerated during this review was restored. |

Keep the shared simulation, gesture state machine, stale-result guards, camera cleanup, and resource disposal. Their complexity addresses real requirements. MediaPipe's video detection is synchronous, and its official documentation recommends workers to avoid blocking the UI; removing this worker would be a poor simplification. [MediaPipe web guidance](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js).

For performance, first measure rendering and inference together on actual hardware. Static scenery and avatar parts are already batched, so “batch the scene” alone is not a new finding. Prefer reducing work while paused, keeping unchanged geometry, and tuning quality/DPR for the target devices. The current loop usually continues rendering behind overlays; camera inference also continues while disarmed. Preserve inference where it serves setup or practice, and suspend it where it serves no interaction. Three.js documents the battery cost of unnecessary continuous rendering for static views. [Three.js rendering guidance](https://threejs.org/manual/en/rendering-on-demand.html).

The minimap runs four reference-power simulations in addition to the active prediction on each HUD update. Their reference results can be cached when only power changes, but this is a measured optimization candidate, not an urgent redesign: a warm Node probe measured approximately 0.92 ms median and 1.13 ms p95 for five simulations on this machine. Do not introduce another worker, physics engine, or global caching framework without a demonstrated bottleneck. Also check low-frame-rate shot pacing: `scene.update` caps elapsed time at 80 ms, which slows playback below 12.5 FPS even though the trajectory was precomputed.

Defer accounts, online multiplayer, additional courses, a progression economy, more cosmetic categories, generalized input/plugin systems, a framework migration, and photorealistic rendering. Both existing input modes remain central. The next investment should make the current nine holes and both controls feel worth returning to.

**Recommended delivery order and proposed acceptance checks:**

| Sequence | Deliverable | Evidence to seek |
|---|---|---|
| 1 | Reliable session and input behavior | Practice never overwrites a round; stable click/hold semantics; focus survives edits and overlays; camera readiness survives normal hole transitions |
| 2 | One excellent short-game experience in both modes | Readable green view; controllable soft/medium/strong camera strokes; putting motion and contact audio; players can explain why a putt missed |
| 3 | Tune assistance and three representative holes | Compare novice and returning-player decisions and scores; test whether deliberate play improves on the unchanged-default policy |
| 4 | Laptop polish and onboarding | Target 60 FPS with a stable 30 FPS fallback at laptop resolution, measured with camera on and off; complete first drive/chip/putt without external instructions |

For initial playtesting, use a small group covering keyboard/trackpad, mouse, left- and right-handed camera play, and comfortable seated/standing positions. Proposed camera checks: at least 90% of deliberate test swings recognized in each tested condition, no accidental shots during a five-minute sequence of ordinary setup/reaching movements, no duplicate shots, and reproducible low-power control. Treat these as starting acceptance targets to refine, not current measured results. Record time to first shot, calibration repetitions, abandoned shots, frame-time distribution, and whether players want another hole. A simple local test log is sufficient; an analytics service is not required.
