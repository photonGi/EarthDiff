"use client";

import { useCallback, useState } from "react";

type Props = {
  beforeSrc: string;
  afterSrc: string;
  beforeLabel: string;
  afterLabel: string;
};

export function CompareSlider({
  beforeSrc,
  afterSrc,
  beforeLabel,
  afterLabel,
}: Props) {
  const [position, setPosition] = useState(50);

  const onInput = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setPosition(Number.parseInt(event.target.value, 10));
  }, []);

  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-border bg-black shadow-lg shadow-black/40">
      {/* After = base layer */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={afterSrc}
        alt={`Satellite after ${afterLabel}`}
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />

      {/* Before clipped */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ width: `${position}%` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={beforeSrc}
          alt={`Satellite before ${beforeLabel}`}
          className="absolute inset-0 h-full max-w-none object-cover"
          style={{ width: `${10000 / Math.max(position, 1)}%` }}
          draggable={false}
        />
      </div>

      <div
        className="pointer-events-none absolute inset-y-0 w-0.5 bg-white/90 shadow-[0_0_12px_rgba(0,0,0,0.5)]"
        style={{ left: `${position}%` }}
        aria-hidden
      />

      <input
        type="range"
        min={0}
        max={100}
        value={position}
        onChange={onInput}
        aria-label="Drag to compare before and after satellite imagery"
        className="absolute inset-0 z-10 h-full w-full cursor-ew-resize opacity-0"
      />

      <span className="pointer-events-none absolute left-3 top-3 rounded-md bg-black/55 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
        {beforeLabel}
      </span>
      <span className="pointer-events-none absolute right-3 top-3 rounded-md bg-black/55 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
        {afterLabel}
      </span>
      <span className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-[10px] uppercase tracking-wider text-white/90 backdrop-blur-sm">
        Drag to compare
      </span>
    </div>
  );
}
