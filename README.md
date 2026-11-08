# oldspoon.github.io

Personal site: a monospace CV panel next to a spinning dot-matrix swirl.
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
- no shader runtime: the spinning swirl is drawn on the same 2D canvas as the
  dot grid, with no WebGL; `lucide-react` for icons

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
      portfolio-hero.tsx     # CV panel, theme toggle, swirl box
      grid-backdrop.tsx     # site-wide dot grid, swirl, flashlight
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

## The spinning swirl

The spinning element is not a separate panel or shader: it is a field of the
same 8px grid dots, drawn by `grid-backdrop.tsx` inside the right-hand half of
the page (and above the CV text below `md`). The hero component tells the grid
where that box is with `swirlRegionRef`, so the swirl follows the layout.

- Three log-spiral arms, ordered-dithered (4x4 Bayer) so the arms break into
  square pixels instead of a smooth gradient.
- It spins at about 5°/s. Hovering bends the arms around the pointer and
  brightens the cells nearby; pressing and dragging spins it with the pointer,
  and a flick keeps spinning for a moment after release.
- On narrow viewports the swirl spans only a few dozen cells, so it is drawn
  with brightness instead of a hard dither to stay legible.
- `prefers-reduced-motion` stops the idle rotation and the bubble; dragging
  still works there, because it is user-driven.

### Site-wide grid

`components/ui/grid-backdrop.tsx` is a fixed, full-viewport canvas (z-20,
`pointer-events: none`) that sits over the whole page, so the CV text, the
project list and the swirl all share one grid:

- a faint, always-on 8px dot grid of 2px square pixels in the violet accent
  (`#B897FB` on near-black, `#6D28D9` on white);
- the spinning swirl described above;
- a circular flashlight that follows the pointer anywhere on the site and
  reveals a brighter layer of the same dots through a soft scrim;
- a bubble: while the pointer moves, the dots around it bulge outwards and
  settle back into the grid when it stops.

Every dot is the same colour and size. Brightness is the only variable: the
distance from the pointer sets how bright a dot is in the flashlight, and the
swirl sets it inside its disc. There are no random accents, particles or spark
effects. Content sits above the backdrop (`z-30`) and clicks pass straight
through it.

### Crosshair cursor

On fine-pointer devices the crosshair is the cursor, everywhere and at all
times: `app/src/index.css` sets `cursor: none !important` on `html` and every
descendant, so no element or user-agent style can bring the native cursor
back. Its centre is the hot spot, so clicks land where it points. It opens up
over links, buttons and the swirl (arms scale to 1.35), shrinks while the
mouse is pressed, and labels the grid cell under the pointer. Touch devices
are not affected. See
[`docs/how-it-was-built.md`](docs/how-it-was-built.md#cursor) for details.
`prefers-reduced-motion` turns off the swirl's idle rotation and the bubble,
and switches the flashlight on and off instantly instead of easing it.

### Project links

A project in the list is plain text; only `(demo)` and `(source)` are links.
The project name does not link anywhere, so the list has exactly one link per
reachable destination.

## Deployment

Push to `main`. GitHub Pages is configured to serve from the branch root, so
only the generated root `index.html` plus `favicon*`, `apple-touch-icon.png`
and `robots.txt` need to be present. `node_modules/`, `.vite/` and `app/dist/`
are ignored.
