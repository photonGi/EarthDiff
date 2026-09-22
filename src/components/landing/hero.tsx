"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";

const presets = [
  {
    title: "Lake Mead",
    subtitle: "Reservoir recession",
    before: "#1a3a2f",
    after: "#3d2a1a",
  },
  {
    title: "Rondônia",
    subtitle: "Forest frontier",
    before: "#0f2818",
    after: "#2a2410",
  },
  {
    title: "Venice lagoon",
    subtitle: "Coastal change",
    before: "#1a2840",
    after: "#243848",
  },
];

const stagger = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.08,
      duration: 0.45,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  }),
};

export function LandingHero() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 grain opacity-60"
        aria-hidden
      />

      <motion.div
        className="pointer-events-none absolute -left-1/4 top-0 h-[70vh] w-[80vw] rounded-full opacity-40 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(56,189,248,0.25) 0%, transparent 70%)",
        }}
        animate={
          reduceMotion
            ? undefined
            : { x: [0, 24, 0], y: [0, 12, 0] }
        }
        transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
        aria-hidden
      />
      <motion.div
        className="pointer-events-none absolute -right-1/4 bottom-0 h-[60vh] w-[70vw] rounded-full opacity-30 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(129,140,248,0.2) 0%, transparent 70%)",
        }}
        animate={
          reduceMotion ? undefined : { x: [0, -20, 0], y: [0, -16, 0] }
        }
        transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
        aria-hidden
      />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-8">
        <span className="font-mono text-sm tracking-tight text-muted">
          earthdiff
        </span>
        <Link
          href="https://github.com/photonGi/EarthDiff"
          className="text-sm text-muted transition hover:text-foreground"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </Link>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-6 pb-24 pt-12 md:pt-20">
        <motion.p
          className="font-mono text-xs uppercase tracking-[0.2em] text-sky-400/90"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          Sentinel-2 · free public data
        </motion.p>

        <motion.h1
          className="mt-6 max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight text-foreground md:text-6xl"
          custom={0}
          initial={reduceMotion ? false : "hidden"}
          animate="show"
          variants={stagger}
        >
          git diff for the planet.
        </motion.h1>

        <motion.p
          className="mt-6 max-w-xl text-lg leading-relaxed text-muted"
          custom={1}
          initial={reduceMotion ? false : "hidden"}
          animate="show"
          variants={stagger}
        >
          Draw a box, pick two date windows, and see what changed on the ground —
          with hectares by change type and a before/after view. Every number is
          computed from the pixels, not invented by a model.
        </motion.p>

        <motion.div
          className="mt-10 flex flex-wrap items-center gap-4"
          custom={2}
          initial={reduceMotion ? false : "hidden"}
          animate="show"
          variants={stagger}
        >
          <span className="inline-flex cursor-not-allowed items-center rounded-full bg-gradient-to-r from-sky-400 to-indigo-400 px-6 py-2.5 text-sm font-medium text-slate-950 opacity-90">
            Explorer — coming next
          </span>
          <span className="text-sm text-muted">
            Run locally:{" "}
            <code className="font-mono text-foreground/80">npm run spike:render</code>
          </span>
        </motion.div>

        <section className="mt-24">
          <motion.h2
            className="text-sm font-medium text-foreground"
            custom={3}
            initial={reduceMotion ? false : "hidden"}
            animate="show"
            variants={stagger}
          >
            Curated examples (preview)
          </motion.h2>
          <p className="mt-2 max-w-lg text-sm text-muted">
            Presets will open with one click — instant before/after and change
            overlays on documented events.
          </p>

          <ul className="mt-8 grid gap-4 sm:grid-cols-3">
            {presets.map((preset, index) => (
              <motion.li
                key={preset.title}
                custom={4 + index}
                initial={reduceMotion ? false : "hidden"}
                animate="show"
                variants={stagger}
                whileHover={reduceMotion ? undefined : { y: -4 }}
                transition={{ type: "spring", stiffness: 400, damping: 28 }}
                className="group relative overflow-hidden rounded-xl border border-border bg-surface/80"
              >
                <div className="relative aspect-[16/10] overflow-hidden">
                  <div
                    className="absolute inset-0 transition-opacity duration-500 group-hover:opacity-0"
                    style={{ background: preset.before }}
                  />
                  <div
                    className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                    style={{ background: preset.after }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                  <p className="absolute bottom-3 left-3 text-sm font-medium text-white">
                    {preset.title}
                  </p>
                </div>
                <p className="px-4 py-3 text-xs text-muted">{preset.subtitle}</p>
              </motion.li>
            ))}
          </ul>
        </section>

        <motion.footer
          className="mt-20 border-t border-border pt-8 text-xs text-muted"
          custom={8}
          initial={reduceMotion ? false : "hidden"}
          animate="show"
          variants={stagger}
        >
          Contains modified Copernicus Sentinel data. 10 m resolution · cloud-dependent
          · revisit ~5 days.
        </motion.footer>
      </main>
    </div>
  );
}
