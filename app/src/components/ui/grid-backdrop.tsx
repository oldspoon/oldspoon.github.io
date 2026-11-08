"use client"

import { useEffect, useRef, type RefObject } from "react"

type GridBackdropProps = {
  theme: "dark" | "light"
  /** Box of the spinning vortex, so the crosshair opens up over it. */
  vortexRegionRef?: RefObject<HTMLElement | null>
}

// Technical dot-matrix language: 8px pitch, 2px square dots, one violet accent.
const CELL = 8
const DOT = 2
const FLASHLIGHT_RADIUS = 160
// How far the dots around the pointer bulge outwards at full burst, so the
// grid reads as a soft bubble around the cursor while it moves.
const BUBBLE_PUSH = 14

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
 * - The dots around the pointer bulge outwards into a soft bubble while the
 *   pointer moves, and settle back when it stops.
 * - On fine-pointer devices the crosshair (a DOM element, z-50) is the cursor
 *   everywhere. Its centre is the exact hot spot, so clicks and hovers land
 *   where the crosshair is.
 * - The arms open up over links, buttons, form controls and the vortex panel,
 *   shrink while the mouse button is held, and the label shows the grid cell
 *   under the pointer.
 */
export default function GridBackdrop({ theme, vortexRegionRef }: GridBackdropProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cursorRef = useRef<HTMLDivElement>(null)
  const armsRef = useRef<SVGGElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)
  // Lives outside the effect so a theme change does not lose the pointer: the
  // crosshair has to stay visible while the flash-light is rebuilt.
  const pointerRef = useRef({ x: 0, y: 0, active: false, reveal: 0, burst: 0 })

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

    // True over the vortex panel, which is draggable even though it is a canvas
    // and not a link.
    const overVortex = (x: number, y: number) => {
      const region = vortexRegionRef?.current

      if (!region) return false

      const rect = region.getBoundingClientRect()

      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
    }

    // Moves the crosshair to the pointer and refreshes its state. The DOM
    // writes only happen when something actually changes.
    const updateCursor = () => {
      cursor.style.transform = `translate3d(${pointer.x}px, ${pointer.y}px, 0)`

      const hit = document.elementFromPoint(pointer.x, pointer.y)
      const interactive =
        !!hit?.closest(INTERACTIVE_SELECTOR) || overVortex(pointer.x, pointer.y)

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
    }

    const onPointerUp = (event: PointerEvent) => {
      pressed = false
      applyArmScale()

      if (event.pointerType !== "mouse") onPointerLeave()
    }

    const onPointerLeave = () => {
      pointer.active = false
      pressed = false
      overInteractive = false
      pointerVisible = false
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
            x + offsetX - DOT / 2,
            y + offsetY - DOT / 2,
            DOT,
            DOT,
          )
        }
      }
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

      frame = requestAnimationFrame(render)
    }

    const onMotionChange = () => {
      reduceMotion = motionQuery.matches

      if (reduceMotion) pointer.burst = 0
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
  }, [theme, vortexRegionRef])

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
