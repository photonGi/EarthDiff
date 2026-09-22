"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type PresetSummary = {
  slug: string;
  title: string;
  subtitle: string;
};

type AnalysisResponse = {
  beforeSceneId: string;
  afterSceneId: string;
  beforeDate: string;
  afterDate: string;
  coverage: number;
  elapsedMs: number;
  warnings: string[];
  detection: {
    totals: Record<string, { hectares: number; regions: number }>;
    regionCount: number;
  };
};

type Props = {
  presets: PresetSummary[];
};

export function ExplorerPanel({ presets }: Props) {
  const searchParams = useSearchParams();
  const initialPreset = searchParams.get("preset") ?? "rondonia";

  const [selected, setSelected] = useState(initialPreset);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResponse | null>(null);

  const active = useMemo(
    () => presets.find((p) => p.slug === selected),
    [presets, selected],
  );

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/analyses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ preset: selected }),
      });

      const body = (await response.json()) as AnalysisResponse & {
        error?: string;
      };

      if (!response.ok) {
        setError(body.error ?? `Request failed (${response.status}).`);
        return;
      }

      setResult(body);
    } catch {
      setError("Network error. If this timed out on Vercel Hobby, upgrade to Pro for 60s functions or run locally.");
    } finally {
      setLoading(false);
    }
  }, [selected]);

  const totals = result
    ? Object.entries(result.detection.totals).sort(
        (a, b) => b[1].hectares - a[1].hectares,
      )
    : [];

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/" className="text-sm text-muted transition hover:text-foreground">
        ← Home
      </Link>

      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Explorer</h1>
      <p className="mt-3 text-muted">
        Run change detection on a curated area. First request pulls satellite
        bands from the public archive — typically 15–30 seconds.
      </p>

      <label className="mt-8 block text-sm font-medium" htmlFor="preset">
        Preset
      </label>
      <select
        id="preset"
        className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
        value={selected}
        onChange={(event) => setSelected(event.target.value)}
        disabled={loading}
      >
        {presets.map((preset) => (
          <option key={preset.slug} value={preset.slug}>
            {preset.title} — {preset.subtitle}
          </option>
        ))}
      </select>

      {active ? (
        <p className="mt-2 text-xs text-muted">Selected: {active.subtitle}</p>
      ) : null}

      <button
        type="button"
        onClick={run}
        disabled={loading}
        className="mt-6 inline-flex items-center rounded-full bg-gradient-to-r from-sky-400 to-indigo-400 px-6 py-2.5 text-sm font-medium text-slate-950 disabled:opacity-60"
      >
        {loading ? "Analyzing…" : "Run analysis"}
      </button>

      {loading ? (
        <p className="mt-4 text-sm text-sky-400/90" role="status">
          Searching scenes → reading bands → masking cloud → detecting change…
        </p>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      {result ? (
        <section className="mt-10 rounded-xl border border-border bg-surface/60 p-6">
          <h2 className="text-sm font-medium">Results</h2>
          <p className="mt-2 font-mono text-xs text-muted">
            {result.beforeDate.slice(0, 10)} → {result.afterDate.slice(0, 10)} ·{" "}
            {(result.coverage * 100).toFixed(0)}% clear overlap ·{" "}
            {(result.elapsedMs / 1000).toFixed(1)}s
          </p>
          {result.warnings.map((warning) => (
            <p key={warning} className="mt-2 text-xs text-amber-200/90">
              {warning}
            </p>
          ))}

          <ul className="mt-6 space-y-2">
            {totals.map(([cls, total]) => (
              <li
                key={cls}
                className="flex items-baseline justify-between border-b border-border/60 py-2 text-sm"
              >
                <span className="text-muted">{cls.replaceAll("_", " ")}</span>
                <span className="font-tabular font-mono text-foreground">
                  {total.hectares.toFixed(0)} ha
                  <span className="ml-2 text-xs text-muted">
                    ({total.regions} regions)
                  </span>
                </span>
              </li>
            ))}
          </ul>

          <p className="mt-4 text-xs text-muted">
            {result.detection.regionCount} regions total. Map overlay and share
            links come next.
          </p>
        </section>
      ) : null}
    </div>
  );
}
