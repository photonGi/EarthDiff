import Link from "next/link";

const presets = [
  {
    slug: "rondonia",
    title: "Rondônia",
    subtitle: "Forest frontier",
    before: "#0f2818",
    after: "#2a2410",
  },
  {
    slug: "lake-mead",
    title: "Lake Mead",
    subtitle: "Reservoir recession",
    before: "#1a3a2f",
    after: "#3d2a1a",
  },
  {
    slug: "venice",
    title: "Venice lagoon",
    subtitle: "Coastal change",
    before: "#1a2840",
    after: "#243848",
  },
] as const;

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        className="ambient -left-1/4 top-0 h-[55vh] w-[70vw] bg-sky-500/20"
        aria-hidden
      />
      <div
        className="ambient ambient-b -right-1/4 bottom-0 h-[45vh] w-[60vw] bg-indigo-500/15"
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
        <p className="hero-in font-mono text-xs uppercase tracking-[0.2em] text-sky-400/90">
          Sentinel-2 · free public data
        </p>

        <h1 className="hero-in hero-in-1 mt-6 max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight text-foreground md:text-6xl">
          git diff for the planet.
        </h1>

        <p className="hero-in hero-in-2 mt-6 max-w-xl text-lg leading-relaxed text-muted">
          Draw a box, pick two date windows, and see what changed on the ground
          — with hectares by change type and a before/after view. Every number is
          computed from the pixels, not invented by a model.
        </p>

        <div className="hero-in hero-in-3 mt-10 flex flex-wrap items-center gap-4">
          <Link
            href="/explore"
            className="inline-flex items-center rounded-full bg-gradient-to-r from-sky-400 to-indigo-400 px-6 py-2.5 text-sm font-medium text-slate-950 transition hover:brightness-110"
          >
            Open explorer
          </Link>
          <span className="text-sm text-muted">
            Or run{" "}
            <code className="font-mono text-foreground/80">npm run spike:render</code>
          </span>
        </div>

        <section className="mt-24">
          <h2 className="hero-in hero-in-4 text-sm font-medium text-foreground">
            Curated examples
          </h2>
          <p className="hero-in hero-in-4 mt-2 max-w-lg text-sm text-muted">
            One-click presets with documented real-world change. Analysis runs on
            our servers — first run may take 15–30 seconds.
          </p>

          <ul className="hero-in hero-in-5 mt-8 grid gap-4 sm:grid-cols-3">
            {presets.map((preset) => (
              <li key={preset.slug}>
                <Link
                  href={`/explore?preset=${preset.slug}`}
                  className="group block overflow-hidden rounded-xl border border-border bg-surface/80 transition hover:border-sky-500/30"
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
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <footer className="mt-20 border-t border-border pt-8 text-xs text-muted">
          Contains modified Copernicus Sentinel data. 10 m resolution ·
          cloud-dependent · revisit ~5 days.
        </footer>
      </main>
    </div>
  );
}
