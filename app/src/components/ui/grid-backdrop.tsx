"use client"

import { useEffect, useRef, type RefObject } from "react"

type GridBackdropProps = {
  theme: "dark" | "light"
  /** Box the spinning grid swirl is drawn inside. */
  swirlRegionRef?: RefObject<HTMLElement | null>
}

// Technical dot-matrix language: 8px pitch, 2px square dots, one violet accent.
const CELL = 8
const DOT = 2
const FLASHLIGHT_RADIUS = 160
// How far the dots around the pointer bulge outwards at full burst, so the
// grid reads as a soft bubble around the cursor while it moves.
const BUBBLE_PUSH = 14

// The spinning element is not a separate panel: it is a swirl of the same grid
// dots, so it lives on the lattice and the cursor can drag it around.
const SWIRL_ARMS = 3
const SWIRL_TIGHTNESS = 3
const SWIRL_TWIST = 1.1
const SWIRL_BASE_SPIN = 0.09 // rad/s, roughly 5°/s
const SWIRL_RADIUS_RATIO = 0.4
const SWIRL_GRAB_RADIUS = 170
const SWIRL_MAX_SPIN = 7

// 4x4 ordered dither matrix: turns the smooth spiral into grid pixels instead
// of a painted gradient.
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

// Only devices with a precise hover pointer get the custom crosshair cursor.
const FINE_POINTER_QUERY = "(hover: hover) and (pointer: fine)"

// Elements that open up the crosshair, so links and buttons still read as
// clickable now that the native hand is gone.
const INTERACTIVE_SELECTOR =
  'a[href], button, [role="button"], input, select, textarea, label, summary, [data-cursor="interactive"]'

const PALETTE = {
  dark: {
    grid: "184, 151, 251",
    scrim: "9, 9, 11",
  },
  light: {
    grid: "109, 40, 217",
    scrim: "255, 255, 255",
  },
} as const

/**
 * Site-wide dot-matrix backdrop with a crosshair cursor.
 *
 * - A faint 8px grid of violet dots sits behind the page content (canvas, z-20).
 * - A circular flashlight reveals a brighter layer of the same dots around the
 *   pointer. Every dot is the same colour and size; only its distance from the
 *   pointer changes how bright it is.
 * - A bubble: while the pointer moves, the dots around it bulge outwards and
 *   settle back when it stops.
 * - A swirl of the same dots fills the panel next to the CV. It spins on its
 *   own and can be hovered, grabbed and dragged with the pointer.
 * - On fine-pointer devices the crosshair (a DOM element, z-50) is the cursor
 *   everywhere. Its centre is the exact hot spot, so clicks and hovers land
 *   where the crosshair is.
 * - The arms open up over links, buttons, form controls and the swirl, shrink
 *   while the mouse button is held, and the label shows the grid cell under
 *   the pointer.
 */
export default function GridBackdrop({ theme, swirlRegionRef }: GridBackdropProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cursorRef = useRef<HTMLDivElement>(null)
  const armsRef = useRef<SVGGElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)
  // Lives outside the effect so a theme change does not lose the pointer: the
  // crosshair has to stay visible while the flash-light is rebuilt.
  const pointerRef = useRef({ x: 0, y: 0, active: false, reveal: 0, burst: 0 })
  // Same for the swirl's angle, so toggling the theme does not snap it back.
  const spinRef = useRef({ rotation: 0, velocity: SWIRL_BASE_SPIN })

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    const cursor = cursorRef.current
    const arms = armsRef.current
    const label = labelRef.current

    if (!canvas || !ctx || !cursor || !arms || !label) return

    const palette = PALETTE[theme]
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
    const finePointer = window.matchMedia(FINE_POINTER_QUERY)

    let reduceMotion = motionQuery.matches
    let width = 0
    let height = 0
    let lastFrame = performance.now()
    let frame = 0

    const pointer = pointerRef.current
    let pressed = false
    let overInteractive = false
    let pointerVisible = pointer.active
    let crosshairShown = false
    let lastCell = ""

    // Spinning grid swirl. Its box is re-measured every frame, so it follows
    // scroll, resize and the mobile layout.
    const swirl = {
      active: false,
      cx: 0,
      cy: 0,
      radius: 0,
      rotation: spinRef.current.rotation,
      velocity: spinRef.current.velocity,
      influence: 0,
      hovering: false,
      dragging: false,
      angle: 0,
      stamp: 0,
    }

    const measureSwirl = () => {
      const region = swirlRegionRef?.current

      if (!region) {
        swirl.active = false
        return
      }

      const rect = region.getBoundingClientRect()

      swirl.cx = rect.left + rect.width / 2
      swirl.cy = rect.top + rect.height / 2
      swirl.radius = Math.min(rect.width, rect.height) * SWIRL_RADIUS_RATIO
      swirl.active =
        swirl.radius > 24 &&
        rect.bottom > 0 &&
        rect.top < height &&
        rect.right > 0 &&
        rect.left < width
    }

    const inSwirl = (x: number, y: number) =>
      swirl.active && Math.hypot(x - swirl.cx, y - swirl.cy) <= swirl.radius * 1.06

    const base = document.createElement("canvas")
    const baseCtx = base.getContext("2d")

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)

      width = window.innerWidth
      height = window.innerHeight
      canvas.width = Math.max(1, Math.round(width * dpr))
      canvas.height = Math.max(1, Math.round(height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      if (!baseCtx) return

      base.width = canvas.width
      base.height = canvas.height
      baseCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
      baseCtx.clearRect(0, 0, width, height)
      baseCtx.fillStyle = `rgba(${palette.grid}, ${theme === "dark" ? 0.08 : 0.06})`

      for (let x = CELL / 2; x < width; x += CELL) {
        for (let y = CELL / 2; y < height; y += CELL) {
          baseCtx.fillRect(x - DOT / 2, y - DOT / 2, DOT, DOT)
        }
      }
    }

    // The crosshair is the cursor, so it is shown for as long as a fine pointer
    // is inside the window. Nothing is allowed to take its place.
    const applyCursorState = () => {
      const visible = pointerVisible && finePointer.matches

      if (visible === crosshairShown) return

      crosshairShown = visible
      cursor.style.opacity = visible ? "1" : "0"
    }

    // The arms open up over interactive elements and shrink while the mouse
    // button is held, so the crosshair still signals what is clickable.
    const applyArmScale = () => {
      const scale = pressed ? 0.8 : overInteractive ? 1.35 : 1

      arms.style.transform = `scale(${scale})`
    }

    // Moves the crosshair to the pointer and refreshes its state. The DOM
    // writes only happen when something actually changes.
    const updateCursor = () => {
      cursor.style.transform = `translate3d(${pointer.x}px, ${pointer.y}px, 0)`

      const hit = document.elementFromPoint(pointer.x, pointer.y)
      const interactive =
        !!hit?.closest(INTERACTIVE_SELECTOR) || inSwirl(pointer.x, pointer.y)

      if (interactive !== overInteractive) {
        overInteractive = interactive
        applyArmScale()
      }

      const cell = `${Math.floor(pointer.x / CELL)}:${Math.floor(pointer.y / CELL)}`

      if (cell !== lastCell) {
        lastCell = cell
        label.textContent = cell
      }
    }

    const onPointerMove = (event: PointerEvent) => {
      const distance = Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y)

      pointer.x = event.clientX
      pointer.y = event.clientY
      pointer.active = true
      pointerVisible = true
      updateCursor()
      applyCursorState()

      if (swirl.dragging) {
        // Dragging applies the pointer's angle around the swirl centre to the
        // rotation directly; its angular speed is kept for the release.
        const angle = Math.atan2(pointer.y - swirl.cy, pointer.x - swirl.cx)
        const now = event.timeStamp || performance.now()
        const dt = Math.min(0.1, Math.max(0.008, (now - swirl.stamp) / 1000))
        let delta = angle - swirl.angle

        if (delta > Math.PI) delta -= Math.PI * 2
        if (delta < -Math.PI) delta += Math.PI * 2

        swirl.angle = angle
        swirl.stamp = now
        swirl.rotation += delta
        swirl.velocity = Math.max(
          -SWIRL_MAX_SPIN,
          Math.min(SWIRL_MAX_SPIN, swirl.velocity * 0.6 + (delta / dt) * 0.4),
        )
      }

      swirl.hovering = inSwirl(pointer.x, pointer.y)

      if (distance < 0.5) return

      pointer.burst = Math.min(1, pointer.burst + distance / 140 + 0.06)
    }

    const onPointerDown = (event: PointerEvent) => {
      pointer.x = event.clientX
      pointer.y = event.clientY
      pointer.active = true
      pointerVisible = true
      pointer.burst = 1
      pressed = true
      applyArmScale()
      updateCursor()

      if (inSwirl(event.clientX, event.clientY)) {
        swirl.dragging = true
        swirl.hovering = true
        swirl.velocity = 0
        swirl.angle = Math.atan2(event.clientY - swirl.cy, event.clientX - swirl.cx)
        swirl.stamp = event.timeStamp || performance.now()
      }
    }

    const onPointerUp = (event: PointerEvent) => {
      pressed = false
      swirl.dragging = false
      applyArmScale()

      if (event.pointerType !== "mouse") onPointerLeave()
    }

    const onPointerLeave = () => {
      pointer.active = false
      pressed = false
      overInteractive = false
      pointerVisible = false
      swirl.dragging = false
      swirl.hovering = false
      applyArmScale()
      applyCursorState()
    }

    // Keeps the cursor state correct when the page scrolls under a stationary
    // pointer.
    const onScroll = () => {
      if (pointer.active) updateCursor()
    }

    const drawScrim = (radius: number) => {
      const gradient = ctx.createRadialGradient(
        pointer.x,
        pointer.y,
        radius * 0.12,
        pointer.x,
        pointer.y,
        radius,
      )

      gradient.addColorStop(0, `rgba(${palette.scrim}, ${0.8 * pointer.reveal})`)
      gradient.addColorStop(0.72, `rgba(${palette.scrim}, ${0.55 * pointer.reveal})`)
      gradient.addColorStop(1, `rgba(${palette.scrim}, 0)`)
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(pointer.x, pointer.y, radius, 0, Math.PI * 2)
      ctx.fill()
    }

    const drawGrid = (radius: number, reveal: number) => {
      const cx = pointer.x
      const cy = pointer.y
      const startX = Math.max(0, Math.floor((cx - radius) / CELL) * CELL)
      const startY = Math.max(0, Math.floor((cy - radius) / CELL) * CELL)
      const endX = Math.min(width, cx + radius)
      const endY = Math.min(height, cy + radius)

      for (let gridX = startX; gridX < endX; gridX += CELL) {
        for (let gridY = startY; gridY < endY; gridY += CELL) {
          const x = gridX + CELL / 2
          const y = gridY + CELL / 2
          const dx = x - cx
          const dy = y - cy
          const distance = Math.sqrt(dx * dx + dy * dy)

          if (distance > radius) continue

          const falloff = 1 - distance / radius
          const alpha = Math.pow(falloff, 0.4) * reveal * 0.85
          const push = reduceMotion ? 0 : pointer.burst * BUBBLE_PUSH * falloff
          const offsetX = distance > 0 ? (dx / distance) * push : 0
          const offsetY = distance > 0 ? (dy / distance) * push : 0

          ctx.fillStyle = `rgba(${palette.grid}, ${alpha})`
          ctx.fillRect(
            Math.round(x + offsetX - DOT / 2),
            Math.round(y + offsetY - DOT / 2),
            DOT,
            DOT,
          )
        }
      }
    }

    // The swirl is drawn straight into the grid: every visible dot is a grid
    // cell whose brightness comes from a log-spiral field, ordered-dithered so
    // the arms are made of the same square pixels as the rest of the page.
    // Hovering bends the arms around the pointer; dragging spins it.
    const drawSwirl = (delta: number) => {
      if (!swirl.active) return

      const cx = swirl.cx
      const cy = swirl.cy
      const radius = swirl.radius
      const influence = swirl.influence
      const grab = swirl.dragging ? 0.6 : 1
      const hovering = pointer.active && influence > 0.001
      const pointerNear = hovering
        ? pointer.reveal *
          Math.max(0, 1 - Math.hypot(pointer.x - cx, pointer.y - cy) / (radius * 1.7))
        : 0
      const startX = Math.max(0, Math.floor((cx - radius) / CELL) * CELL)
      const startY = Math.max(0, Math.floor((cy - radius) / CELL) * CELL)
      const endX = Math.min(width, cx + radius)
      const endY = Math.min(height, cy + radius)
      // A narrow box leaves only a couple of dozen cells across, which is too
      // coarse for the dither, so there the arms are drawn with brightness.
      const coarse = radius < CELL * 26
      const floor = coarse ? 0.1 : 0.04
      const spread = 1 - floor

      for (let gridX = startX; gridX < endX; gridX += CELL) {
        const x = gridX + CELL / 2
        const dx = x - cx

        for (let gridY = startY; gridY < endY; gridY += CELL) {
          const y = gridY + CELL / 2
          const dy = y - cy
          const distance = Math.sqrt(dx * dx + dy * dy)

          if (distance > radius || distance < 0.5) continue

          const t = distance / radius
          let angle = Math.atan2(dy, dx) + SWIRL_TWIST * (1 - t)
          let lift = 0

          if (hovering) {
            const px = x - pointer.x
            const py = y - pointer.y
            const pd = Math.sqrt(px * px + py * py)
            const pull = 1 - pd / SWIRL_GRAB_RADIUS

            if (pull > 0) {
              const soft = pull * pull * pull
              angle += soft * grab * influence
              lift = soft * influence
            }
          }

          const phase =
            SWIRL_ARMS * angle + SWIRL_TIGHTNESS * Math.log(t + 0.16) - swirl.rotation
          const wave = 0.5 + 0.5 * Math.cos(phase)
          const fade = Math.min(1, (1 - t) / 0.22) * Math.min(1, t / 0.2)
          const density =
            fade *
            (floor +
              spread *
              (coarse ? wave * wave * wave : wave * wave * wave * wave * wave))
          const boost = 0.7 + 1.0 * pointerNear + 0.9 * lift
          let alpha: number

          if (coarse) {
            if (density < 0.07) continue
            alpha = Math.min(1, (0.08 + 1.1 * density) * boost)
          } else {
            const column = gridX / CELL
            const row = gridY / CELL
            const dither = (BAYER4[(row & 3) * 4 + (column & 3)] + 0.5) / 16

            if (density <= dither) continue
            alpha = Math.min(1, (0.35 + 0.65 * density) * boost)
          }

          ctx.fillStyle = `rgba(${palette.grid}, ${Math.round(alpha * 100) / 100})`
          ctx.fillRect(Math.round(x - DOT / 2), Math.round(y - DOT / 2), DOT, DOT)
        }
      }

      if (!reduceMotion) {
        if (swirl.dragging) {
          swirl.velocity *= Math.max(0, 1 - delta * 3)
        } else {
          // Ease back to the resting spin after a flick.
          swirl.velocity += (SWIRL_BASE_SPIN - swirl.velocity) * Math.min(1, delta * 1.2)
          swirl.rotation += swirl.velocity * delta
        }
      } else if (!swirl.dragging) {
        swirl.velocity = 0
      }

      swirl.influence +=
        ((swirl.hovering || swirl.dragging ? 1 : 0) - influence) * Math.min(1, delta * 12)
    }

    const render = (now: number) => {
      const delta = Math.min(0.05, (now - lastFrame) / 1000)

      lastFrame = now
      ctx.clearRect(0, 0, width, height)
      ctx.drawImage(base, 0, 0, width, height)

      // Reduced motion keeps the reveal, but turns it on and off instantly
      // instead of easing it.
      const target = pointer.active ? 1 : 0

      pointer.reveal +=
        (target - pointer.reveal) * (reduceMotion ? 1 : Math.min(1, delta * 8))

      if (reduceMotion) {
        pointer.burst = 0
      } else {
        pointer.burst *= Math.max(0, 1 - delta * 3.5)
      }

      if (pointer.reveal > 0.01 && width > 0 && height > 0) {
        const baseRadius = Math.min(FLASHLIGHT_RADIUS, Math.min(width, height) * 0.32)
        const radius = baseRadius * (0.6 + 0.4 * pointer.reveal)

        drawScrim(radius)
        drawGrid(radius, pointer.reveal)
      }

      measureSwirl()
      drawSwirl(delta)

      frame = requestAnimationFrame(render)
    }

    const onMotionChange = () => {
      reduceMotion = motionQuery.matches

      if (reduceMotion) {
        pointer.burst = 0
        swirl.velocity = 0
      }
    }

    resize()
    applyArmScale()

    // The effect restarts on theme change, so restore the crosshair exactly
    // where the pointer already is instead of leaving it invisible until the
    // next move.
    cursor.style.opacity = "0"
    cursor.style.transform = `translate3d(${pointer.x}px, ${pointer.y}px, 0)`
    crosshairShown = false
    updateCursor()
    applyCursorState()

    const observer = new ResizeObserver(resize)

    observer.observe(document.documentElement)
    motionQuery.addEventListener("change", onMotionChange)
    window.addEventListener("resize", resize)
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("pointermove", onPointerMove, { passive: true })
    window.addEventListener("pointerdown", onPointerDown, { passive: true })
    window.addEventListener("pointerup", onPointerUp, { passive: true })
    window.addEventListener("blur", onPointerLeave)
    document.documentElement.addEventListener("pointerleave", onPointerLeave)

    frame = requestAnimationFrame((now) => {
      lastFrame = now
      render(now)
    })

    return () => {
      cancelAnimationFrame(frame)
      spinRef.current.rotation = swirl.rotation
      spinRef.current.velocity = swirl.velocity
      observer.disconnect()
      motionQuery.removeEventListener("change", onMotionChange)
      window.removeEventListener("resize", resize)
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerdown", onPointerDown)
      window.removeEventListener("pointerup", onPointerUp)
      window.removeEventListener("blur", onPointerLeave)
      document.documentElement.removeEventListener("pointerleave", onPointerLeave)
    }
  }, [theme])

  const palette = PALETTE[theme]

  return (
    <>
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-20">
        <canvas ref={canvasRef} className="h-full w-full" />
      </div>

      <div
        ref={cursorRef}
        aria-hidden="true"
        className="pointer-events-none fixed top-0 left-0 z-50 opacity-0 transition-opacity duration-150 will-change-transform"
        style={{
          color: `rgb(${palette.grid})`,
          filter: "drop-shadow(0 0 1px rgb(0 0 0 / 0.5))",
        }}
      >
        <svg
          className="absolute -top-6 -left-6 overflow-visible"
          width="48"
          height="48"
          viewBox="-24 -24 48 48"
        >
          <g
            ref={armsRef}
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            style={{ transition: "transform 120ms ease-out" }}
          >
            <path d="M-24 0H-6M6 0H24M0 -24V-6M0 6V24" />
          </g>
          <rect x="-1" y="-1" width="2" height="2" fill={`rgb(${palette.grid})`} />
        </svg>
        <span
          ref={labelRef}
          className="absolute top-4 left-7 font-mono text-[10px] leading-none whitespace-nowrap"
        />
      </div>
    </>
  )
}
