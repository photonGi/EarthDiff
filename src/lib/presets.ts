import type { BoundingBox } from "./stac";

export type Preset = {
  slug: string;
  title: string;
  subtitle: string;
  bbox: BoundingBox;
  beforeStart: string;
  beforeEnd: string;
  afterStart: string;
  afterEnd: string;
  sourceUrl?: string;
};

/** Smaller boxes keep serverless runs under typical time limits. */
export const PRESETS: Preset[] = [
  {
    slug: "rondonia",
    title: "Rondônia",
    subtitle: "Amazon deforestation frontier",
    bbox: { west: -62.35, south: -9.45, east: -62.15, north: -9.25 },
    beforeStart: "2019-07-01",
    beforeEnd: "2019-09-15",
    afterStart: "2024-07-01",
    afterEnd: "2024-09-15",
    sourceUrl: "https://www.gov.br/inpe/pt-br/assuntos/programas/amazonia/prodes",
  },
  {
    slug: "lake-mead",
    title: "Lake Mead",
    subtitle: "Reservoir recession",
    bbox: { west: -114.55, south: 36.0, east: -114.35, north: 36.15 },
    beforeStart: "2019-06-01",
    beforeEnd: "2019-08-31",
    afterStart: "2024-06-01",
    afterEnd: "2024-08-31",
    sourceUrl: "https://www.usbr.gov/lc/region/g4000/hourly/elevs/elevs.html",
  },
  {
    slug: "venice",
    title: "Venice lagoon",
    subtitle: "Coastal change",
    bbox: { west: 12.25, south: 45.35, east: 12.45, north: 45.48 },
    beforeStart: "2019-06-01",
    beforeEnd: "2019-08-31",
    afterStart: "2024-06-01",
    afterEnd: "2024-08-31",
  },
];

export function getPreset(slug: string): Preset | undefined {
  return PRESETS.find((p) => p.slug === slug);
}
