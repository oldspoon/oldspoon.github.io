# How this site was built

This document records how the site was rebuilt, what each step changed, and
the decisions behind them. The README covers day-to-day commands and layout;
this file covers the history and the reasoning.

## 1. Starting point

- The repo `oldspoon/oldspoon.github.io` held a single hand-written
  `index.html` (commit `7e90525`, "Portfolio site") plus favicons and
  `robots.txt`. GitHub Pages served it from the branch root.
- The old page contained the author's full name and personal email. These
  were removed in the rebuild. Only the `oldspoon` handle and the contact
  links to GitHub remain.
- Project entries came from the old page only: `rasa-ai-assistant` (with a
  `(demo)` link at `https://oldspoon.github.io/Rasa-AI-Assistant/` and a
  `(source)` link) and `tennis-game` (`(source)` only). Both URLs were
  checked to return HTTP 200 before use.

## 2. Stack and project structure

The rebuild targets a shadcn-compatible React project:

| Concern | Choice | Where |
| --- | --- | --- |
| Bundler | Vite 7 | `vite.config.ts` |
| Language | TypeScript (strict) | `tsconfig.json` |
| Styling | Tailwind CSS v4 via `@tailwindcss/vite` | `app/src/index.css` |
| Component layout | shadcn/ui conventions | `components.json` |
| Shader | none — the swirl is canvas | `app/src/components/ui/grid-backdrop.tsx` |
| Icons | `lucide-react` | used for the theme toggle |
| Helper | `cn()` (clsx + tailwind-merge) | `app/src/lib/utils.ts` |

Key decisions:

- **Source in `app/`, output at the root.** Vite's `root` is `app/`, so the
  source tree is `app/src/`. shadcn expects `components/ui` and `lib/utils`
  under `@/`, which maps to `app/src/*` in both `tsconfig.json` and
  `vite.config.ts`.
- **Single-file build.** `vite-plugin-singlefile` inlines JS and CSS into one
  `index.html`. GitHub Pages then serves that file directly, with no build
  step on the server.
- **Publish step.** `scripts/publish.mjs` copies `app/dist/index.html` to the
  repo root and deletes `app/dist`. `npm run build` runs typecheck, then the
  Vite build, then publish. The root `index.html` is a generated file and
  should not be edited by hand.
- **`components.json`** uses the `new-york` style, `neutral` base colour, CSS
  variables, lucide icons, and aliases under `@/`. It is there so that
  `npx shadcn@latest add <component>` writes into `app/src/components/ui`.

## 3. Hero component integration

The reference component was copied to `app/src/components/ui/portfolio-hero.tsx`
and adapted as follows:

1. **Placeholder content replaced.** The template's CV content (a made-up
   name and made-up company entries) was not used. The component renders the
   site's real bio and project list.
2. **Icons.** The inline SVG sun and moon were replaced with `lucide-react`
   `Sun` and `Moon`.
3. **Theme state.** Theme is `dark` or `light`, stored in `localStorage` under
   `oldspoon-theme`. `app/index.html` sets the theme on `<html>` before React
   loads, to avoid a flash of the wrong theme.
4. **Responsive layout.** Two columns from `md` up. Below `md` the swirl's box
   moves above the text with a fixed height of 38vh.
5. **No shader panel.** The WebGL `Dithering` panel (and the
   `@paper-design/shaders-react` dependency) was removed: the spinning element
   had to be part of the grid and manipulatable by the cursor. The component
   now renders an empty, `aria-hidden` box with `data-grid-swirl` and passes
   its ref to `GridBackdrop`, which draws the swirl inside that box.

No providers, data fetching, or image assets were needed. The component takes
no props.

## 4. The grid system

### Reference

The grid style was taken from `https://www.infrawatch.com/`. The values below
were read from that page's CSS and rendered output:

- 8px grid pitch, with 2px square dots
- White for the base dots, violet `#B897FB` and sparse coral `#F6543E` for
  accents
- Near-black background, `#09090B`
- Thin 1px dash marks, and a soft-edged reveal window

Only the visual language was taken. No code was copied from that site. The
site later dropped the mark accents, the dashes and the coral: every dot is
now the same violet and only the flashlight changes a dot's brightness.

### Implementation

`app/src/components/ui/grid-backdrop.tsx` renders two layers, both fixed to the
viewport and both with `pointer-events: none`, so links keep receiving clicks:

- a full-viewport `<canvas>` at `z-20` for the dot grid, the spinning swirl
  and the flashlight;
- a DOM crosshair at `z-50` that acts as the cursor (see the Cursor section).

The page content sits at `z-30`, between the two, so text stays readable.

How it works:

- **Base grid.** Drawn once per resize into an offscreen canvas, then copied
  each frame. This keeps the per-frame cost low.
- **Flashlight.** A circular reveal follows the pointer: a radial scrim plus a
  brighter layer of the same violet dots. The radius is
  `min(160px, 32% of the smaller viewport side)`.
- **Spinning swirl.** A log-spiral field of the same grid dots, drawn inside
  the box the hero hands over through `swirlRegionRef`. The box is re-measured
  every frame, so the swirl follows scroll, resize and the mobile layout. Arms
  come from `phase = 3 * angle + 3 * ln(t + 0.16) - rotation`, and the
  resulting density is ordered-dithered with a 4x4 Bayer matrix, so the arms
  are made of square grid pixels rather than a painted gradient. Radius is 40%
  of the box's smaller side.
- **Manipulating the swirl.** Hovering bends the spiral phase around the
  pointer (170px, cubic falloff) and brightens nearby cells. Pressing inside
  starts a drag: the pointer's angle around the swirl centre is applied to the
  rotation directly, its angular speed is remembered, and a flick keeps
  spinning for a moment before easing back to the idle 5°/s. Pointer events
  stay on the window, so links keep working.
- **Uniform dots.** Every dot is 2px and uses the same violet. Alpha depends
  only on the distance from the pointer (`(1 - d / r) ** 0.4`), so the reveal
  is a smooth falloff with no random colour, size or position variation.
- **Bubble.** Pointer movement fills a `burst` value (`+ distance / 140 + 0.06`
  per move, clamped to 1) which decays at `1 - delta * 3.5`. It pushes each dot
  radially outwards by `burst * 14px * falloff`, so the grid bulges into a soft
  bubble around the cursor while it moves and returns to the exact 8px grid
  when it stops. A click sets `burst` to 1 for a pop.
- **No projectiles.** There are no particles, sparks or falling dashes. Only
  the swirl moves on its own; everything else settles to a static frame once
  `burst` decays (the swirl's idle rotation is the one continuous animation).
- **Theme.** Dark and light palettes are defined in one `PALETTE` object, and
  the swirl's angle lives in a ref so a theme change does not restart it.
- **Reduced motion.** The swirl's idle rotation and the bubble stop, and the
  reveal switches on and off instantly instead of easing. Dragging the swirl
  still works, because it is user-driven. The crosshair stays, because the
  crosshair is the cursor.

### Cursor

On devices with a precise hover pointer (`(hover: hover) and (pointer: fine)`),
the crosshair is the only cursor:

- **Always on.** `app/src/index.css` sets `cursor: none !important` on `html`
  and every descendant, so nothing can override it and the native cursor never
  reappears, not even over links or text. Touch and other coarse-pointer
  devices keep their normal behaviour.
- **Crosshair.** A DOM element at `z-50`, moved with `transform: translate3d`
  on each pointer move. Its centre is the exact hot spot, so a click lands on
  whatever is under the crosshair. The two arms are 1px lines in the violet
  accent with a 2px violet centre dot.
- **Hover state.** The component checks what is under the pointer
  (`document.elementFromPoint`) on each move and on scroll, plus whether the
  pointer is inside the swirl's circle. Over `a[href]`, `button`,
  `[role="button"]`, form controls, `label`, `summary`, an element with
  `data-cursor="interactive"`, or the swirl, the arms scale to 1.35 so the
  crosshair visibly opens over anything clickable or draggable.
- **Pressed state.** While the mouse button is down the arms scale to 0.8.
- **Label.** A small label beside the crosshair shows the grid cell under the
  pointer as `column:row`.
- **Leaving the window** hides the crosshair (`pointerleave` and `blur`). A
  theme change rebuilds the canvas but keeps the crosshair where it is instead
  of hiding it until the next move.

Use `data-cursor="interactive"` on any custom clickable element that is not
reached by the selector above.

## 5. Verification

Each change was checked in a headless browser (Chromium and Microsoft Edge)
through the DevTools protocol: `npm run build` output, `Input.dispatchMouseEvent`
for pointer movement and presses, a Playwright script for assertions, and
`Page.captureScreenshot` for images. Checks covered:

- `npm run typecheck` and `npm run build` after each change
- dark and light themes, including the toggle
- the 390px mobile viewport, checked for horizontal overflow, and no crosshair
  on touch
- the native cursor is `none` on `body`, on text and on links, and the
  crosshair is visible and positioned at the pointer in all of those places
- over a link the arms scale to 1.35 and over plain background to 1
- the crosshair stays visible through a theme change, at the same position
- the bubble decays to nothing once the pointer is still (checked on the dot
  rows outside the swirl, which is the only thing still animating); while the
  pointer moves, rows of dots are measurably displaced outwards and return to
  an exact 8px pitch after it stops
- a 300px window around the pointer contains no red pixels after fast movement
  in both themes; only violet dots are revealed
- the crosshair shrinks to 0.8 while the mouse is pressed
- a click on the GitHub link opens the link, so the overlay never blocks it
- each project row contains only `(demo)` and `(source)` links; the project name
  is text, not an anchor
- `prefers-reduced-motion` emulated with `Emulation.setEmulatedMedia`: the
  swirl stops rotating and consecutive canvas frames are identical, while
  dragging it still changes the frame and leaves no inertia
- dragging the swirl rotates the arms, a flick keeps spinning after release,
  and hovering inside its circle opens the crosshair
- the swirl is centred in its box on desktop (720x900) and at 390px, and the
  page has no horizontal overflow
- console exceptions (none were seen in the final runs)
- the live site after deploy, by size and by DOM markers

The test scripts were temporary and are not in the repo.

## 6. Deploying

- GitHub Pages serves the branch root from `main`. The build output is the
  root `index.html`, which must be committed with the source.
- Typical order: edit source, `npm run build`, then `git add -A`, commit, and
  `git push origin main`.
- Pages took about 2 to 4 minutes per successful deploy.
- Two runs of `pages-build-deployment` failed for commit `0c0716f`, with
  "Timeout reached, aborting!" and "Deployment cancelled" at the deploy step.
  The same content deployed after an empty retrigger commit (`77b4e9d`).
  If a deploy fails with no change to the source, retrigger it. Either push an
  empty commit, or call `POST /repos/oldspoon/oldspoon.github.io/pages/builds`
  with a token that has Pages write access. Do not commit tokens to the repo.
- To confirm a deploy, compare the size of `curl https://oldspoon.github.io/`
  with the size of the local `index.html`. Pages can serve the previous build
  for several minutes after a push.

## 7. Known limits

- The swirl is drawn in the same per-frame pass as the flashlight. On a 1440px
  viewport its disc is roughly 4,000 grid cells, which is cheap, but it is the
  most expensive part of the canvas.
- On narrow viewports the swirl spans only a few dozen cells, so it is drawn
  with brightness instead of a hard dither and reads softer than on desktop.
- The flashlight label is 10px DOM text. This is fine on desktop. It has not
  been tested on high-DPI mobile devices.
- The custom cursor depends on CSS `cursor: none !important`. Browser-owned
  UI such as scrollbars may still show the operating system cursor. This was not
  tested. Text selection has no I-beam either, only the crosshair, which is the
  intended trade-off of the always-on cursor.
- Screenshot checks ran in headless Edge with SwiftShader. Real GPU output
  may differ in timing, though not in layout.
- `robots.txt` disallows all crawlers, and the page carries `noindex` meta
  tags. Both were kept from the original site.
