"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import {
  AnalysisResults,
  type AnalysisResultView,
} from "./analysis-results";

type PresetSummary = {
  slug: string;
  title: string;
  subtitle: string;
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
  const [result, setResult] = useState<AnalysisResultView | null>(null);

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

      const body = (await response.json()) as AnalysisResultView & {
        error?: string;
      };

      if (!response.ok) {
        setError(body.error ?? `Request failed (${response.status}).`);
        return;
      }

      setResult(body);
    } catch {
      setError(
        "Network error. If this timed out on Vercel Hobby, upgrade to Pro for 60s functions or run locally.",
      );
    } finally {
      setLoading(false);
    }
  }, [selected]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-12 pb-24">
      <Link
        href="/"
        className="text-sm text-muted transition hover:text-foreground"
      >
        ← Home
      </Link>

      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Explorer</h1>
      <p className="mt-3 max-w-xl text-muted">
        Run change detection on a curated area. You will get real satellite
        before/after imagery, a coloured change map, and hectares by type.
      </p>

      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="block text-sm font-medium" htmlFor="preset">
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
        </div>
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-sky-400 to-indigo-400 px-8 py-2.5 text-sm font-medium text-slate-950 disabled:opacity-60"
        >
          {loading ? "Analyzing…" : "Run analysis"}
        </button>
      </div>

      {loading ? (
        <div
          className="mt-10 overflow-hidden rounded-xl border border-border bg-surface/50"
          role="status"
        >
          <div className="aspect-[16/10] animate-pulse bg-gradient-to-br from-surface via-sky-950/30 to-surface" />
          <p className="border-t border-border px-4 py-3 text-sm text-sky-400/90">
            Finding clear passes → reading bands → building change map…
          </p>
        </div>
      ) : null}

      {error ? (
        <p className="mt-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      {result && active ? (
        <AnalysisResults result={result} presetTitle={active.title} />
      ) : null}
    </div>
  );
}
