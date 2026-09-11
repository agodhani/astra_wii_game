# Verification record

## Environment

Linux x86_64, Node.js 24.21.0, Vite 7.3.6, Three.js 0.180.0, MediaPipe Tasks Vision 0.10.32, Playwright 1.58.2 / Chromium 145. Browser tests use ANGLE SwiftShader software graphics and production assets; they do not depend on Vite hot reload.

## Evidence established

- Unit suite: 31 tests passed with `npm test` on 2026-09-11. Covers shot power bounds, driver/iron/wedge behavior, realistic arcade rollout, continuous overhit spread, wind, rotation, water and out-of-bounds penalties, putting capture, nine playable hole layouts, local turn order, full nine-hole score progression, practice, 12-stroke cap, local save recovery, camera gesture interpretation/lifecycle, minimap ground and hazard paths, and avatar combinations/animations.
- Production build: `npm run build` passed on 2026-09-11, with separate main, Three.js and pose-worker chunks.
- Final production-browser suite: **7 passed in 1.1 minutes** on 2026-09-11. Covers customization/save, round start, a real animated shot, exit/reload/resume, presets/settings/practice, clubs/aim/max power, native Space activation, two-player final-hole completion/results/replay, meter containment, pointer/keyboard orbit preserving aim, camera-unavailable recovery, and actual local model loading/inference with synthetic video followed by track cleanup.
- Renderer-only browser inspection loaded all nine courses and all six presets, verified orbit independence and exact shot completion, and found no accumulated geometry leak. See [renderer report](../renderer-report.md).
- Code review identified and fixed keyboard shortcut interception, non-monotonic overhit spread, misleading minimap penalty roll, and the stroke-cap mismatch. See [review fixes](../review-fixes.md).

## Final review

The final review also reproduced blocked browser storage preventing startup. Moving storage-handle lookup inside the error boundary fixed it; the throwing-getter regression passed with the complete unit suite. `git diff --check` is clean. The consolidated browser suite rebuilds production assets before running. Desktop and 1024 × 768 screenshots were refreshed and inspected after the final changes.

## Visual records

- `app-menu.png`, `app-customize.png`, `app-setup.png`: integrated interface inspection.
- `renderer-integrated-play.png`, `renderer-integrated-laptop.png`: revised playable camera framing with the slim meter and compact club selector.
- `renderer-*.png`: renderer-focused snapshots before final UI integration.

The screenshots show actual rendered code. Images under `docs/concepts` are static generated proposals and are not verification screenshots.

## Explicit limits

The user confirmed this computer has no physical camera and will test real swings on another computer. Synthetic landmark and camera-device checks do not prove real swing comfort, sensitivity or robustness to room lighting/occlusion. Real hardware GPU frame rate is also unverified; the software renderer-only sample is reported in the renderer report. Browser-local saves do not sync to another device.
