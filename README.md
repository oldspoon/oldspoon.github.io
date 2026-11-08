# oldspoon.github.io

Personal site: a monospace CV panel next to a live Paper Shaders dither field.
Rebuilt on a React + TypeScript + Tailwind stack with a shadcn-compatible
structure. Content is based only on the previous site; the name and contact
details are anonymized to the `oldspoon` handle, while each project keeps its
real `(demo)` / `(source)` links.

Build history, design decisions and deploy notes are in
[`docs/how-it-was-built.md`](docs/how-it-was-built.md).

## Stack

- React 19 + TypeScript, built with Vite 7
- Tailwind CSS v4 (`@tailwindcss/vite`, no `tailwind.config.js`)
- shadcn/ui layout: `components.json`, `@/` alias, `components/ui`, `lib/utils`
- [`@paper-design/shaders-react`](https://www.npmjs.com/package/@paper-design/shaders-react)
  for the WebGL dither panel, `lucide-react` for icons

## Commands

```bash
npm install
npm run dev        # local dev server (http://localhost:5173)
npm run build      # typecheck, build, and publish a single-file index.html
npm run preview    # preview the built file
npm run typecheck  # tsc --noEmit
```

`npm run build` writes `app/dist/index.html` and then copies it to the repo
root. GitHub Pages serves the root `index.html`, so the deployed site is one
self-contained file (JS and CSS inlined) with no build step on the server.

## Source layout

```
app/
  index.html            # page shell, meta, favicon links, theme bootstrap
  src/
    main.tsx            # React entry
    App.tsx             # renders the hero
    index.css           # Tailwind import + base styles
    components/ui/
      portfolio-hero-with-paper-shaders.tsx
      grid-backdrop.tsx     # site-wide dot grid + flashlight
    lib/utils.ts        # cn() helper used by shadcn components
components.json         # shadcn CLI config
vite.config.ts          # root: app, single-file output, @ alias
```

### Why `components/ui` and the `@/` alias

shadcn/ui's CLI and the components it generates assume:

- components live in `components/ui`, imported as `@/components/ui/<name>`
- the `cn()` helper lives in `lib/utils`, imported as `@/lib/utils`
- the Tailwind entry stylesheet is declared in `components.json`

Because the Vite root is `app/`, those folders are `app/src/components/ui` and
`app/src/lib/utils.ts`. The `@/*` alias in `tsconfig.json` and
`vite.config.ts` maps to `app/src/*`, so generated code resolves exactly as
shadcn expects. Keep new UI primitives in `app/src/components/ui/` and add
global styles/tokens to `app/src/index.css`.

Adding more shadcn components:

```bash
npx shadcn@latest add button
npm run build
```

The CLI reads `components.json` (style, CSS path, aliases) and writes into
`app/src/components/ui`.

## The shader panel

`Dithering` is a client-only WebGL component, kept exactly as it was: swirl
shape, 4x4 dither, `size={3}`, `scale={0.8}`, pink `hsl(320, 100%, 70%)` on
near-black and blue `hsl(220, 100%, 70%)` on near-white, rotating at 4°/s.
`prefers-reduced-motion` stops the rotation and the shader motion (static
frame remains). On narrow screens the panel moves above the CV text and keeps
a fixed 38vh height.

The panel is not interactive in the DOM (`pointer-events: none`); the pointer
acts on the artwork from window listeners instead:

- **Lean.** While the pointer is inside the panel, the artwork leans toward it
  by up to 16px and is drawn overscaled (1.06x) so the lean never exposes an
  edge. Easing is 6/s; reduced motion turns the lean off.
- **Spin.** Pressing inside the panel and dragging turns the vortex with the
  pointer: the pointer's angle around the panel centre is applied to the
  `rotation` prop, the angular speed is remembered, and a flick keeps turning
  for a moment before easing back to the idle 4°/s. Rotation is sent as whole
  degrees, so React still re-renders only a few times a second at rest.
- **Crosshair.** The crosshair opens over the panel (arms at 1.35) like over a
  link. `GridBackdrop` takes `vortexRegionRef` for that one hit test.

### Site-wide grid

`components/ui/grid-backdrop.tsx` is a fixed, full-viewport canvas (z-20,
`pointer-events: none`) that sits over the whole page, so the CV text, the
project list and the shader panel all share one grid:

- a faint, always-on 8px dot grid of 2px square pixels in the violet accent
  (`#B897FB` on near-black, `#6D28D9` on white);
- a circular flashlight that follows the pointer anywhere on the site and
  reveals a brighter layer of the same dots through a soft scrim;
- a bubble: while the pointer moves, the dots around it bulge outwards and
  settle back into the grid when it stops.

Every dot is the same colour and size. Only the distance from the pointer
changes how bright a dot is, so there are no random accents and no particles
or spark effects. Content sits above the backdrop (`z-30`) and clicks pass
straight through it.

### Crosshair cursor

On fine-pointer devices the crosshair is the cursor, everywhere and at all
times: `app/src/index.css` sets `cursor: none !important` on `html` and every
descendant, so no element or user-agent style can bring the native cursor
back. Its centre is the hot spot, so clicks land where it points. It opens up
over links and buttons (arms scale to 1.35), shrinks while the mouse is
pressed, and labels the grid cell under the pointer. Touch devices are not
affected. See
[`docs/how-it-was-built.md`](docs/how-it-was-built.md#cursor) for details.
`prefers-reduced-motion` turns off the shader rotation and the bubble, and
switches the flashlight on and off instantly instead of easing it.

### Project links

A project in the list is plain text; only `(demo)` and `(source)` are links.
The project name does not link anywhere, so the list has exactly one link per
reachable destination. The footer's `Projects` link points at
`https://github.com/oldspoon?tab=repositories`, not at the in-page list.

## Deployment

Push to `main`. GitHub Pages is configured to serve from the branch root, so
only the generated root `index.html` plus `favicon*`, `apple-touch-icon.png`
and `robots.txt` need to be present. `node_modules/`, `.vite/` and `app/dist/`
are ignored.
