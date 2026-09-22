"use client";

import { useMemo, useState } from "react";

import {
  CHANGE_CLASS_COLOR,
  CHANGE_CLASS_LABEL,
  isChangeClass,
} from "@/lib/change-classes";

import { CompareSlider } from "./compare-slider";

export type AnalysisResultView = {
  beforeDate: string;
  afterDate: string;
  coverage: number;
  elapsedMs: number;
  warnings: string[];
  grid: { width: number; height: number; metresPerPixel: number };
  images: { before: string; after: string; composite: string };
  detection: {
    totals: Record<string, { hectares: number; regions: number }>;
    regionCount: number;
    cleanedFlagged: number;
  };
};

function formatHa(ha: number): string {
  if (ha >= 10_000) return `${(ha / 1000).toFixed(1)}k`;
  return ha.toFixed(0);
}

type Props = {
  result: AnalysisResultView;
  presetTitle: string;
};

export function AnalysisResults({ result, presetTitle }: Props) {
  const [view, setView] = useState<"compare" | "changes">("compare");

  const beforeLabel = result.beforeDate.slice(0, 10);
  const afterLabel = result.afterDate.slice(0, 10);

  const beforeSrc = `data:image/png;base64,${result.images.before}`;
  const afterSrc = `data:image/png;base64,${result.images.after}`;
  const compositeSrc = `data:image/png;base64,${result.images.composite}`;

  const rows = useMemo(() => {
    return Object.entries(result.detection.totals)
      .filter(([, t]) => t.hectares > 0)
      .sort((a, b) => b[1].hectares - a[1].hectares)
      .map(([key, total]) => ({
        key,
        total,
        label: isChangeClass(key) ? CHANGE_CLASS_LABEL[key] : key,
        color: isChangeClass(key) ? CHANGE_CLASS_COLOR[key] : [156, 163, 175],
      }));
  }, [result.detection.totals]);

  const totalChangedHa = rows.reduce((sum, row) => sum + row.total.hectares, 0);
  const top = rows[0];
  const extentKm = (
    (result.grid.width * result.grid.metresPerPixel) /
    1000
  ).toFixed(1);

  const headline = top
    ? `Most change here is ${top.label.toLowerCase()} — ${formatHa(top.total.hectares)} ha in ${top.total.regions} patches.`
    : "No significant change detected in this window.";

  const maxHa = top?.total.hectares ?? 1;

  return (
    <section className="results-in mt-12 space-y-8">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-sky-400/90">
          {presetTitle}
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
          {formatHa(totalChangedHa)} hectares changed
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          {headline} Area spans ~{extentKm} km at{" "}
          {result.grid.metresPerPixel.toFixed(0)} m per pixel.
        </p>
      </div>

      <div className="flex gap-2 rounded-full border border-border bg-surface/80 p-1 text-sm">
        <button
          type="button"
          onClick={() => setView("compare")}
          className={`flex-1 rounded-full px-4 py-2 transition ${
            view === "compare"
              ? "bg-white/10 text-foreground"
              : "text-muted hover:text-foreground"
          }`}
        >
          Before / after
        </button>
        <button
          type="button"
          onClick={() => setView("changes")}
          className={`flex-1 rounded-full px-4 py-2 transition ${
            view === "changes"
              ? "bg-white/10 text-foreground"
              : "text-muted hover:text-foreground"
          }`}
        >
          Change overlay
        </button>
      </div>

      {view === "compare" ? (
        <CompareSlider
          beforeSrc={beforeSrc}
          afterSrc={afterSrc}
          beforeLabel={beforeLabel}
          afterLabel={afterLabel}
        />
      ) : (
        <div className="relative aspect-[16/10] overflow-hidden rounded-xl border border-border shadow-lg shadow-black/40">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={compositeSrc}
            alt="Satellite imagery with coloured change regions"
            className="h-full w-full object-cover"
          />
          <div className="absolute bottom-3 left-3 flex flex-wrap gap-2">
            {rows.slice(0, 4).map((row) => (
              <span
                key={row.key}
                className="flex items-center gap-1.5 rounded-md bg-black/55 px-2 py-1 text-[10px] text-white backdrop-blur-sm"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{
                    backgroundColor: `rgb(${row.color.join(",")})`,
                  }}
                />
                {row.label}
              </span>
            ))}
          </div>
        </div>
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <li
            key={row.key}
            className="rounded-xl border border-border bg-surface/70 p-4"
          >
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{
                  backgroundColor: `rgb(${row.color.join(",")})`,
                }}
              />
              <span className="text-sm font-medium">{row.label}</span>
            </div>
            <p className="mt-2 font-tabular font-mono text-2xl tracking-tight">
              {formatHa(row.total.hectares)}
              <span className="ml-1 text-sm font-normal text-muted">ha</span>
            </p>
            <p className="mt-1 text-xs text-muted">
              {row.total.regions} regions
            </p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full transition-[width] duration-700 ease-out"
                style={{
                  width: `${Math.min(100, (row.total.hectares / maxHa) * 100)}%`,
                  backgroundColor: `rgb(${row.color.join(",")})`,
                }}
              />
            </div>
          </li>
        ))}
      </ul>

      <p className="font-mono text-xs text-muted">
        {beforeLabel} → {afterLabel} · {(result.coverage * 100).toFixed(0)}%
        clear overlap · {(result.elapsedMs / 1000).toFixed(1)}s ·{" "}
        {result.detection.regionCount} regions
      </p>

      {result.warnings.map((warning) => (
        <p
          key={warning}
          className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-xs text-amber-100/90"
        >
          {warning}
        </p>
      ))}
    </section>
  );
}
