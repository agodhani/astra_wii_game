# astra_wii_game

**Blue Bay Golf** is an original, casual 3D browser golf game. Play nine sunny coastal holes with keyboard and mouse or local webcam swing controls, create your own athletic golfer, and share a round with up to four local players.

The interface keeps the course clear: shot direction, carry, roll and hazard predictions appear only on the minimap. A compact cream club selector and slim Cozy Club–style power meter sit below the course. Overhit remains inside the meter.

![Blue Bay Golf gameplay](docs/verification/renderer-integrated-play.png)

## Run locally

Install Node.js **22.12 or newer** (tested with Node 24). In a terminal:

```sh
git clone git@github.com:agodhani/astra_wii_game.git
cd astra_wii_game
npm ci
npm run dev
```

Open **http://localhost:5173**. Use current Chrome or Edge with hardware acceleration enabled. `npm ci` prepares local MediaPipe WASM wrappers; the pose model is included in this repository.

For a production build:

```sh
npm run build
npm run preview
```

Open the localhost URL shown in the terminal. The contents of `dist/` can be hosted at the root of a static HTTPS site. Camera access requires **localhost or HTTPS**; opening an HTTP LAN address on a different computer does not meet browser camera requirements. For your other computer, clone the repository and run it there on localhost.

## Play

- **Tee off now:** one click starts the full nine as your last-selected golfer with keyboard and mouse. An unfinished round turns this into **Resume round**.
- **Play online:** Play online → Host a lobby gives a 6-character code and a QR join link. Up to 3 friends join on their own devices (the host can remove anyone), and turns pass automatically. The host's game runs every shot and sends the result to the other players over PeerJS's free public broker (`src/net/lobby.js`), so no server is needed. `tests/browser/online.spec.js` needs internet access.
- **Challenge a friend:** after a scored nine, the results card shares a link with your score and an emoji scorecard. Anyone who opens it lands on a menu with a "Take the challenge" one-click start, and their results card shows who won.
- **Read the green:** within 40 yd of the pin, or with the putter, the map zooms to the ball and the cup. It shows downhill slope arrows and 10/20 ft rings, and putts show the estimated roll and the distance left, in feet.
- **Set up a round:** choose all nine holes, the opening three, or an individual hole. Add one to four players and choose each player's controls.
- **Your golfer:** start from Maya, Kai, Amir, Zoe, Leo or Val. Edit name, relaxed/sharp face, build, hair, skin, outfit, colors, hat and accessories. Save over the selected profile or create a new local golfer.
- **Practice range:** take repeat shots from the tee. Use the input selector to try camera swings when ready.
- **How to play:** five short lessons explain clubs, the minimap, power, webcam setup and scoring.

| Control | Action |
|---|---|
| A / D or left / right arrows | Rotate shot aim |
| Q / E or club selector arrows | Previous / next club |
| Power meter / up / down arrows | Adjust planned power |
| Click Swing or tap Space | Shoot with planned power |
| Hold Swing or Space past 0.4 s, then release | Charge and shoot |
| Skip to result, Space, Enter or click the course while the ball is moving | Jump to where the ball stops |
| Space, when the course has keyboard focus | Charge and shoot |
| Drag the course or J / L / I / K | Orbit the view without changing aim |
| Reset-view button | Return to the shot camera |
| Escape / Pause | Pause the round |

White minimap dots represent 25%, 50%, 75% and 100% club power. The gold diamond is estimated carry; the dashed path and stopping marker show rollout. Wind, slope and lie affect the prediction. At **100–120%**, overhit gives modest extra range with a wider accuracy spread. The meter never overflows. Driver, wood, two irons, pitching wedge, sand wedge and putter behave differently.

A glowing tracer follows the ball in the air, a ring marks where it lands, and rollout plays fast-forward. Shots use real elapsed time, so a low frame rate does not stretch them. A result card shows the distance, lie and distance left (feet on the green), or the score name when you hole out.

Water and out-of-bounds add one penalty stroke and return the ball to its previous lie. Local golfers play from the farthest unfinished ball. A hole ends at the cup or the forgiving 12-stroke cap. Characters, settings, best nine-hole score and round progress save in this browser; they do not sync between computers.

## Webcam mode on your other computer

1. Choose **Camera swing**, then **Enable camera** and grant browser permission.
2. Pick a device and handedness. Face the camera with shoulders, elbows and both hands visible.
3. With empty hands together in a relaxed address position, select **Calibrate** and remain still until it completes.
4. Make a practice backswing to your dominant side, then swing across your body and through. Adjust sensitivity or enable smaller gestures for comfort.
5. Select **Ready to play**. Aim and select clubs with the keyboard or mouse, then swing to take the shot.

The camera estimates an arcade power value from body landmarks; it does not measure real clubhead speed, club-face angle or spin. A Web Worker processes frames locally with MediaPipe. Frames are never recorded or uploaded. Lost tracking cancels incomplete swings. The game offers retry, recalibration and keyboard fallback, and stops camera capture when camera mode or the game is exited.

**Physical webcam swing comfort and accuracy remain unverified here:** this computer has no camera, and the user will test on a second computer. Synthetic landmark tests exercise calibration, handedness, confidence loss, cooldown and power saturation. Browser tests separately check unavailable-camera recovery and loading the real model with a synthetic video device.

## Validation

```sh
npm test
npx playwright install chromium
npm run test:browser
npm run build
```

Browser tests build and serve production assets on port 4173. They use Chromium's software graphics backend for reproducible headless execution. See [verification notes](docs/verification/README.md) for the current evidence and known limits.

The renderer uses original procedural 3D geometry rather than the detailed raster concept art. It provides graphics quality and reduced-motion settings. The default **Auto** quality measures the frame rate every second: below 45 FPS it lowers render resolution (down to 0.5×); after three seconds above 57 FPS it raises it again, up to 1.5× on high-DPI screens. `window.__golfPerf` reports the current FPS and render scale. Software SwiftShader measured about 8.6 FPS at 1440×1000 in an earlier renderer-only sample; this is not a hardware GPU performance measurement. Smooth performance on the target laptop remains to be measured.

## Security and review pipeline

Every change goes through two gates: [no-mistakes](https://github.com/kunchenguid/no-mistakes) on your machine before push, and GitHub Actions (`.github/workflows/ci.yml`, `.github/workflows/security.yml`) on the PR.

```sh
no-mistakes init                # once per clone; adds the `no-mistakes` git remote
git push no-mistakes <branch>   # review -> test -> security gates -> push -> PR -> CI
npm run security                # run the security scanners directly
```

`.no-mistakes.yaml` adds three security gates to the AI review and test steps. Each runs `scripts/security/gate.mjs`, which CI runs too:

| Gate | Scanner | Blocks on | Fix policy |
|---|---|---|---|
| `secrets` | gitleaks | any leaked credential | always waits for you (rotate the credential) |
| `sast` | semgrep `p/javascript` + `p/security-audit` | `ERROR` rules | one automatic repair round |
| `deps` | osv-scanner on `package-lock.json` | CVSS 7.0 or higher (4.0 to 6.9 warns) | one automatic upgrade round when a fixed version exists |

Install the scanners locally: [gitleaks](https://github.com/gitleaks/gitleaks#installing), [semgrep](https://semgrep.dev/docs/getting-started/cli), [osv-scanner](https://google.github.io/osv-scanner/installation/). A missing scanner fails the gate; it never silently passes. Automatic fixes cannot edit `.no-mistakes.yaml`, `.github/**`, or `scripts/security/**`. no-mistakes only reads its config from `main`.

## Project structure

- `src/game/`: course geometry, simulation, scoring, profiles and persistence.
- `src/render/`: Three.js terrain, scenery, avatars, animation and camera.
- `src/input/`: calibrated gesture interpreter, camera lifecycle and pose worker.
- `src/ui/`: screens, minimap, icons and styling; `src/main.js` connects the game.
- `public/models/`, `public/mediapipe/`: local pose model and WASM assets.
- `tests/`: unit and production-browser checks.

The approved scope is in [the goal prompt](docs/golf-goal-prompt.md). [Third-party notices](THIRD_PARTY_NOTICES.md) describe dependency and model sources. All original game names, course layouts, avatar geometry and synthesized audio were created for this project.
