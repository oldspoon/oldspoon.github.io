"use client"

import { Dithering } from "@paper-design/shaders-react"
import { Moon, Sun } from "lucide-react"
import { useEffect, useRef, useState, type RefObject } from "react"
import GridBackdrop from "@/components/ui/grid-backdrop"

type Theme = "dark" | "light"

const THEME_STORAGE_KEY = "oldspoon-theme"

const projects = [
  {
    name: "rasa-ai-assistant",
    description: "machine learning demo for natural language understanding with Rasa",
    source: "https://github.com/oldspoon/Rasa-AI-Assistant",
    demo: "https://oldspoon.github.io/Rasa-AI-Assistant/",
  },
  {
    name: "tennis-game",
    description: "two-player tennis in Java, written to learn game loops and collision handling",
    source: "https://github.com/oldspoon/Tennis-Game",
  },
]

const bio = [
  "I'm a software engineer who builds conversational AI end to end — the NLU and dialogue model, the service behind it, and the interface people actually type into.",
  "What excites me most is large-scale production engineering: keeping a system fast and correct under real traffic, coordinating across many services, and designing for failure before it turns into an outage.",
  "Right now I'm tinkering with ways to apply machine learning algorithms and self-governed LLMs efficiently — smaller models, cheaper inference, and agents that check their own output instead of needing a human in the loop at every step.",
]

function readInitialTheme(): Theme {
  if (typeof document === "undefined") return "dark"
  return document.documentElement.dataset.theme === "light" ? "light" : "dark"
}

// The vortex artwork is the original one: Paper Shaders swirl, 4x4 dither,
// 3px cells, `scale=0.8`, 4°/s. Only the way the cursor acts on it is new.
const VORTEX_BASE_SPIN = 4 // °/s, the original idle rotation
const VORTEX_MAX_SPIN = 540 // °/s, cap while dragging
const VORTEX_LEAN = 16 // px the artwork leans toward the cursor
const VORTEX_ZOOM = 1.06 // constant overscale, so leaning never shows an edge

function DitheringField({
  isDarkMode,
  reduceMotion,
  regionRef,
}: {
  isDarkMode: boolean
  reduceMotion: boolean
  regionRef: RefObject<HTMLDivElement | null>
}) {
  const artRef = useRef<HTMLDivElement>(null)
  const [rotation, setRotation] = useState(0)

  useEffect(() => {
    const art = artRef.current

    if (!art) return

    // One state object for the whole gesture: total angle, current spin, and
    // the lean that the pointer pulls the artwork with.
    const state = {
      angle: 0,
      spin: reduceMotion ? 0 : VORTEX_BASE_SPIN,
      shown: -1,
      dragging: false,
      pointerAngle: 0,
      stamp: performance.now(),
      leanX: 0,
      leanY: 0,
      targetX: 0,
      targetY: 0,
    }

    const rectOf = () => regionRef.current?.getBoundingClientRect() ?? null

    const onMove = (event: PointerEvent) => {
      const rect = rectOf()

      if (!rect) return

      const halfW = rect.width / 2
      const halfH = rect.height / 2
      const cx = rect.left + halfW
      const cy = rect.top + halfH
      const dx = event.clientX - cx
      const dy = event.clientY - cy
      const hovered =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom

      if (reduceMotion || !hovered) {
        state.targetX = 0
        state.targetY = 0
      } else {
        // Lean toward the pointer, clamped to VORTEX_LEAN so the overscale
        // still covers the panel.
        const clamp = (value: number) => Math.max(-1, Math.min(1, value))

        state.targetX = clamp(dx / Math.max(1, halfW)) * VORTEX_LEAN
        state.targetY = clamp(dy / Math.max(1, halfH)) * VORTEX_LEAN
      }

      if (!state.dragging) return

      // Dragging turns the vortex with the pointer: the pointer's angle around
      // the panel centre is applied to the rotation, and its angular speed is
      // kept so the vortex keeps turning after the release.
      const angle = Math.atan2(dy, dx)
      const now = event.timeStamp || performance.now()
      const dt = Math.min(0.1, Math.max(0.008, (now - state.stamp) / 1000))
      let turn = angle - state.pointerAngle

      if (turn > Math.PI) turn -= Math.PI * 2
      if (turn < -Math.PI) turn += Math.PI * 2

      const degrees = (turn * 180) / Math.PI

      state.pointerAngle = angle
      state.stamp = now
      state.angle += degrees
      state.spin = Math.max(
        -VORTEX_MAX_SPIN,
        Math.min(VORTEX_MAX_SPIN, state.spin * 0.6 + (degrees / dt) * 0.4),
      )
    }

    const onDown = (event: PointerEvent) => {
      const rect = rectOf()

      if (!rect) return
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      ) {
        return
      }

      state.dragging = true
      state.spin = 0
      state.pointerAngle = Math.atan2(
        event.clientY - (rect.top + rect.height / 2),
        event.clientX - (rect.left + rect.width / 2),
      )
      state.stamp = event.timeStamp || performance.now()
    }

    const onUp = () => {
      state.dragging = false
    }

    const onLeave = () => {
      state.dragging = false
      state.targetX = 0
      state.targetY = 0
    }

    let frame = 0
    let last = performance.now()

    const tick = (now: number) => {
      const delta = Math.min(0.05, (now - last) / 1000)

      last = now

      if (state.dragging) {
        state.spin *= Math.max(0, 1 - delta * 3)
      } else if (reduceMotion) {
        // No idle spin and no inertia when motion is reduced: the vortex only
        // turns while the pointer is actually dragging it.
        state.spin = 0
      } else {
        state.spin += (VORTEX_BASE_SPIN - state.spin) * Math.min(1, delta * 1.2)
        state.angle += state.spin * delta
      }

      // Whole degrees only, so React re-renders a few times a second at the
      // idle speed, exactly as the original did.
      const rounded = ((Math.round(state.angle) % 360) + 360) % 360

      if (rounded !== state.shown) {
        state.shown = rounded
        setRotation(rounded)
      }

      const ease = Math.min(1, delta * 6)

      if (reduceMotion) {
        // No lean at all under reduced motion, and no per-frame transform
        // writes, so consecutive frames stay pixel-identical.
        if (art.style.transform) art.style.transform = ""
      } else {
        state.leanX += (state.targetX - state.leanX) * ease
        state.leanY += (state.targetY - state.leanY) * ease
        art.style.transform = `translate3d(${state.leanX.toFixed(1)}px, ${state.leanY.toFixed(1)}px, 0) scale(${VORTEX_ZOOM})`
      }

      frame = requestAnimationFrame(tick)
    }

    window.addEventListener("pointermove", onMove, { passive: true })
    window.addEventListener("pointerdown", onDown, { passive: true })
    window.addEventListener("pointerup", onUp, { passive: true })
    window.addEventListener("pointercancel", onUp)
    window.addEventListener("blur", onLeave)
    document.documentElement.addEventListener("pointerleave", onLeave)

    frame = requestAnimationFrame((now) => {
      last = now
      tick(now)
    })

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerdown", onDown)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
      window.removeEventListener("blur", onLeave)
      document.documentElement.removeEventListener("pointerleave", onLeave)
    }
  }, [reduceMotion, regionRef])

  return (
    <div
      ref={artRef}
      aria-hidden="true"
      className="pointer-events-none h-full w-full will-change-transform"
    >
      <Dithering
        style={{ height: "100%", width: "100%" }}
        colorBack={isDarkMode ? "#09090b" : "hsl(0, 0%, 95%)"}
        colorFront={isDarkMode ? "hsl(320, 100%, 70%)" : "hsl(220, 100%, 70%)"}
        shape="swirl"
        type="4x4"
        size={3}
        offsetX={0}
        offsetY={0}
        scale={0.8}
        rotation={rotation}
        speed={reduceMotion ? 0 : 0.1}
      />
    </div>
  )
}

export default function PortfolioHero() {
  const [theme, setTheme] = useState<Theme>(readInitialTheme)
  const [reduceMotion, setReduceMotion] = useState(false)
  // The grid needs the vortex's box, so the crosshair opens up over it too.
  const vortexRegionRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    const sync = () => setReduceMotion(query.matches)

    sync()
    query.addEventListener("change", sync)
    return () => query.removeEventListener("change", sync)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    root.style.colorScheme = theme
    root.style.backgroundColor = theme === "dark" ? "#09090b" : "#ffffff"

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      // Storage can be unavailable in private browsing; theme still works per visit.
    }
  }, [theme])

  const isDarkMode = theme === "dark"
  const muted = isDarkMode ? "text-white/60" : "text-black/60"
  const faint = isDarkMode ? "text-white/40" : "text-black/40"
  const hairline = isDarkMode ? "border-white/15" : "border-black/15"
  const linkClass =
    "underline decoration-transparent decoration-1 underline-offset-4 transition-colors " +
    (isDarkMode
      ? "hover:text-white hover:decoration-white/40 focus-visible:text-white"
      : "hover:text-black hover:decoration-black/40 focus-visible:text-black")

  return (
    <div
      className={`relative flex min-h-screen flex-col overflow-hidden md:flex-row ${
        isDarkMode ? "bg-[#09090b]" : "bg-white"
      }`}
    >
      <section
        className={`relative z-30 flex w-full flex-col justify-between gap-12 p-6 font-mono sm:p-10 md:min-h-screen md:w-1/2 ${
          isDarkMode ? "text-white" : "text-black"
        }`}
      >
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-6">
            <span className={`text-sm tracking-wide ${faint}`}>oldspoon.cv</span>
            <button
              type="button"
              onClick={() => setTheme(isDarkMode ? "light" : "dark")}
              aria-label={isDarkMode ? "Switch to light theme" : "Switch to dark theme"}
              aria-pressed={isDarkMode}
              className={`-mt-2 -mr-2 rounded-full p-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${
                isDarkMode
                  ? "hover:bg-white/10 focus-visible:outline-white/60"
                  : "hover:bg-black/10 focus-visible:outline-black/60"
              }`}
            >
              {isDarkMode ? (
                <Sun aria-hidden="true" className="size-5" strokeWidth={1.5} />
              ) : (
                <Moon aria-hidden="true" className="size-5" strokeWidth={1.5} />
              )}
            </button>
          </div>

          <header className="mt-10 sm:mt-16">
            <h1 className="text-lg leading-tight font-normal tracking-tight">OLDSPOON</h1>
            <p className="text-lg leading-tight font-normal">SOFTWARE ENGINEER</p>
            <div className={`mt-6 max-w-md space-y-4 text-sm leading-relaxed ${muted}`}>
              {bio.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </header>

          <section id="projects" aria-labelledby="projects-heading" className="mt-12">
            <h2
              id="projects-heading"
              className={`text-xs tracking-[0.2em] uppercase ${faint}`}
            >
              Projects
            </h2>
            <ul className="mt-4 max-w-md space-y-5">
              {projects.map((project) => (
                <li key={project.name} className="text-sm leading-relaxed">
                  <span className="font-normal">{project.name}</span>
                  <span className={faint}>: </span>
                  <span>{project.description}</span>
                  <span className={faint}> | </span>
                  {project.demo ? (
                    <>
                      <a
                        href={project.demo}
                        target="_blank"
                        rel="noreferrer"
                        className={linkClass}
                      >
                        (demo)
                      </a>
                      <span className={faint}> | </span>
                    </>
                  ) : null}
                  <a
                    href={project.source}
                    target="_blank"
                    rel="noreferrer"
                    className={linkClass}
                  >
                    (source)
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <footer
          className={`flex flex-wrap items-center gap-x-6 gap-y-2 border-t pt-5 text-sm ${hairline} ${muted}`}
        >
          <a
            href="https://github.com/oldspoon"
            target="_blank"
            rel="noreferrer"
            className={linkClass}
          >
            GitHub
          </a>
          <a
            href="https://github.com/oldspoon?tab=repositories"
            target="_blank"
            rel="noreferrer"
            className={linkClass}
          >
            Projects
          </a>
        </footer>
      </section>

      <div
        ref={vortexRegionRef}
        data-grid-vortex=""
        aria-hidden="true"
        className={`relative order-first h-[38vh] w-full overflow-hidden md:order-last md:h-auto md:min-h-screen md:w-1/2 ${
          isDarkMode ? "bg-[#09090b]" : "bg-white"
        }`}
      >
        <DitheringField
          isDarkMode={isDarkMode}
          reduceMotion={reduceMotion}
          regionRef={vortexRegionRef}
        />
      </div>

      <GridBackdrop theme={theme} vortexRegionRef={vortexRegionRef} />
    </div>
  )
}
