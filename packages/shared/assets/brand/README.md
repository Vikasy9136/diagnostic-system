# LabSetu Brand Assets

This directory is the **single source of truth** for the official LabSetu brand identity across all applications in `diagnostic-platform` (`apps/web/admin`, `apps/web/small-lab`, `apps/web/large-lab`, `apps/web/portal`, and `apps/phlebo-app`).

## Master Reference

- `logo/labsetu-logo.png` — Official master LabSetu logo (`1254 × 1254` RGBA PNG).
  - **Vector SVG Note**: `labsetu-logo.png` contains multi-stop radial/linear gradients, glossy 3D shading on the blood drop, and layered shadows. Rather than generating a lossy auto-traced SVG or wrapping a raster PNG inside an `.svg` container, the high-resolution master PNG is retained directly to preserve exact proportions, colors, and shading.

## Derived Icon Assets (`icons/`)

Generated directly from the upper emblem of `logo/labsetu-logo.png` (medical cross, microscope, blood drop, and teal orbit swoosh, with the wordmark removed for crisp rendering at small sizes):

- `icons/labsetu-icon-only.png` — `1024 × 1024` transparent RGBA emblem
- `icons/favicon-16x16.png` — `16 × 16` browser tab icon
- `icons/favicon-32x32.png` — `32 × 32` browser tab icon
- `icons/favicon.ico` — Multi-size ICO (`16×16`, `32×32`, `48×48`)
- `icons/apple-touch-icon.png` — `180 × 180` iOS home-screen icon
- `icons/pwa-icon-192.png` — `192 × 192` PWA manifest icon
- `icons/pwa-icon-512.png` — `512 × 512` PWA manifest icon

## Usage Guidelines

- Never stretch or distort the logo; always preserve its `1:1` aspect ratio with `object-fit: contain` (Web) or `resizeMode="contain"` (React Native).
- Use `labsetu-icon-only.png` for favicons, collapsed sidebars, small badges, and Android launcher / splash icons.
- Use `labsetu-logo.png` for login screens, full headers, expanded sidebars, and brand showcases.

## Seasonal Festival Icons (`icons/festivals/`)

Pre-bundled festival icon bundles live under `icons/festivals/<festival-key>/` (`diwali`, `holi`, `christmas`, `new-year`, `eid`, `independence-day`, `republic-day`, `raksha-bandhan`, `navratri`, `dussehra`, `custom`).

### Adding a New Festival Icon in the Future

1. Create `icons/festivals/<new-key>/` containing `icon-only.png` (1024×1024), `android-adaptive.png` (1024×1024, 66% safe zone), `favicon-32x32.png`, `favicon.ico`, and `preview.png`.
2. Add the `<new-key>` entry to `FESTIVAL_BUNDLED_CATALOG` in `packages/shared/src/festivalBranding.ts` with a unique `androidAliasName`.
3. Add the `<new-key>` mapping in `apps/phlebo-app/plugins/withDynamicFestivalIcons.js` so `expo prebuild` / EAS builds bundle its `<activity-alias>` and mipmap/drawable resources.
4. Rebuild and release the Android APK/AAB so Android's `PackageManager` can activate the new `<activity-alias>`. (Web favicons work immediately upon deploying `apps/web/*`.)

