# Third-party assets and dependencies

## Three.js

Three.js 0.180.0 is used for rendering under the MIT License. Source and license: https://github.com/mrdoob/three.js/tree/r180 . Installed package license: `node_modules/three/LICENSE`.

## MediaPipe Tasks Vision

`@mediapipe/tasks-vision` 0.10.32 declares Apache-2.0 licensing. Source: https://github.com/google-ai-edge/mediapipe . The browser WASM runtime files in `public/mediapipe/wasm` are copied from that package by `scripts/prepare-assets.js`.

The generated `.mjs` copies prepend a `dbg` logger binding and append `export default ModuleFactory;` to the corresponding `.js` loader. The logger preserves the upstream fallback behavior under ES-module strict mode. This exposes the Emscripten factory to MediaPipe's module-worker fallback without `eval` or remote scripts. The WASM binaries are unchanged.

The Pose Landmarker Lite float16 model is distributed by the MediaPipe project at:
https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task

Model documentation: https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker . A copy of the MediaPipe project's Apache 2.0 license is provided in `public/mediapipe/LICENSE`.

## Fonts

DM Sans and Manrope are loaded from Google Fonts for the interface, with system sans-serif fallbacks. These fonts use the SIL Open Font License. Font requests do not contain camera frames or landmarks.

## Development tools

Vite and Playwright are installed through npm and retain their respective package licenses. They are development dependencies, not third-party game art.

## Original work

Course geometry, character meshes, icons, menus and synthesized audio are original project code. The images in `docs/concepts` are generated visual design references, not game assets or evidence of implemented behavior. The game uses no Nintendo graphics, characters or audio.
