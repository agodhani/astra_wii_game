# Renderer implementation and verification

Implemented in `src/render/scene.js`, `avatar.js`, and `environment.js`. The renderer consumes the shared course terrain and physics trajectory; it does not simulate or predict shots independently.

## Delivered

- Real procedural Three.js terrain for each of the nine hole layouts, with shared terrain height, striped fairways, smooth putting greens, sand and water hazards, physical flags and tee markers.
- Sunny coastal scenery: turquoise ocean, rocky sand shoreline, palms, broadleaf trees, flower beds, sailboats, distant islands, resort houses and a lighthouse. No generated image or static background is used as gameplay.
- Original modular human golfers with the six hairstyle choices, skin and hair colors, relaxed/sharp face, three builds, polos, shorts/trousers/skorts, caps/visors, glasses/earrings/beard. The same model is used in gameplay and customization. Articulated address, swing, idle and celebration poses.
- Camera orbit independent of aim, reset-to-shot view, actual ball flight camera, menu flyover, and a left-column avatar preview with drag rotation.
- High/medium/low graphics settings, pixel-ratio limits, shadow settings, reduced motion, resize observer, context-loss message and resource disposal.
- Static scenery batches and immutable meshes within articulated avatar joints share draw calls. Gameplay contains no prediction lines, projected landing markers, distance labels or trajectory arcs.

## Evidence

- `node tests/render.test.js`: **3 tests passed**. Covers all hair silhouettes, finite visible geometry, articulated animation reset, and combinations of all outfit/headwear/accessory categories.
- `node --check` passed for the three renderer modules.
- Actual Chromium browser inspection at 1440 × 1000: no page errors or WebGL console errors. Screenshots: `docs/verification/renderer-play.png`, `renderer-avatar.png`, `renderer-menu.png`.
- Browser exercised all nine hole loads and six player presets, independent camera orbit, full physics-driven shot playback and repeated scene replacement. Aim remained unchanged by orbit; the shot callback fired exactly once; the rendered stopping point matched the simulation endpoint.
- Final measured draw calls / triangles: play **128 / 206,369**, avatar **115 / 203,177**, menu **81 / 135,893**. Geometry counts across nine replacements stayed between **125 and 136**, rather than accumulating on each course change.

## Performance and limits

Browser was headless Chromium with ANGLE / Vulkan SwiftShader software rendering (`SwiftShader Device (Subzero)`). At 1440 × 1000, a 39-interval low-quality sample averaged **116.23 ms per frame (~8.6 FPS)**. This is a software-renderer measurement, not evidence of smooth play on laptop GPU hardware. Actual GPU performance remains unverified. The artwork is an intentionally stylized procedural implementation, and does not reproduce the detailed raster concept illustrations.

Integrated desktop and 1024 × 768 laptop framing has been inspected; the ball and feet remain above the compact control strip. See `docs/verification/renderer-integrated-play.png` and `renderer-integrated-laptop.png`. The avatar camera assumes an unobstructed left preview column on viewports wider than 760px. Below that width it centers the preview.
