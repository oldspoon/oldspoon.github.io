"use client"

import { Moon, Sun } from "lucide-react"
import { useEffect, useRef, useState } from "react"
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

export default function PortfolioHero() {
  const [theme, setTheme] = useState<Theme>(readInitialTheme)
  // The spinning element is made of grid dots, so the grid needs to know where
  // its box sits; the box itself stays empty and keeps the layout.
  const swirlRegionRef = useRef<HTMLDivElement>(null)

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
          <a href="#projects" className={linkClass}>
            Projects
          </a>
        </footer>
      </section>

      <div
        ref={swirlRegionRef}
        data-grid-swirl=""
        aria-hidden="true"
        className={`relative order-first h-[38vh] w-full overflow-hidden md:order-last md:h-auto md:min-h-screen md:w-1/2 ${
          isDarkMode ? "bg-[#09090b]" : "bg-white"
        }`}
      />

      <GridBackdrop theme={theme} swirlRegionRef={swirlRegionRef} />
    </div>
  )
}
