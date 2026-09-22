/**
 * Sentinel-2 scene discovery via the Element 84 Earth Search STAC API.
 *
 * Requires no credentials: the catalogue and the underlying Cloud-Optimised
 * GeoTIFFs are served from the AWS Open Data mirror. Verified 2026-09-21.
 */

const SEARCH_ENDPOINT = "https://earth-search.aws.element84.com/v1/search";

/** Level 2A surface reflectance. L1C would need atmospheric correction first. */
const COLLECTION = "sentinel-2-l2a";

/** Bands the change pipeline reads, mapped to STAC asset keys. */
export const BANDS = {
  /** True-colour composite, used directly for the before/after display. */
  visual: "visual",
  red: "red",
  green: "green",
  nir: "nir",
  /** 20 m, resampled to the 10 m grid before use. */
  swir16: "swir16",
  /** Scene classification layer, drives cloud masking. Also 20 m. */
  scl: "scl",
} as const;

export type BandKey = keyof typeof BANDS;

export type BoundingBox = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type Scene = {
  id: string;
  /** Acquisition instant, ISO 8601. */
  datetime: string;
  /** Scene-wide cloud percentage. Not a reliable proxy for our window. */
  sceneCloudCover: number;
  /** UTM zone of the scene's native grid. */
  epsg: number;
  /** Asset key to COG URL. */
  hrefs: Record<string, string>;
};

type StacFeature = {
  id: string;
  properties: {
    datetime: string;
    "eo:cloud_cover"?: number;
    "proj:epsg"?: number;
  };
  assets: Record<string, { href: string }>;
};

export type SearchOptions = {
  bbox: BoundingBox;
  /** Inclusive start of the acquisition window. */
  start: Date;
  /** Inclusive end of the acquisition window. */
  end: Date;
  /**
   * Scene-wide cloud ceiling. Deliberately generous, because a scene can be
   * heavily clouded overall and still clear over a small area of interest —
   * local cloud fraction is scored separately from the classification band.
   */
  maxSceneCloudCover?: number;
  limit?: number;
};

export async function searchScenes(options: SearchOptions): Promise<Scene[]> {
  const { bbox, start, end, maxSceneCloudCover = 60, limit = 12 } = options;

  const response = await fetch(SEARCH_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      collections: [COLLECTION],
      bbox: [bbox.west, bbox.south, bbox.east, bbox.north],
      datetime: `${start.toISOString()}/${end.toISOString()}`,
      query: { "eo:cloud_cover": { lt: maxSceneCloudCover } },
      limit,
      sortby: [{ field: "properties.eo:cloud_cover", direction: "asc" }],
    }),
  });

  if (!response.ok) {
    throw new Error(
      `STAC search failed: ${response.status} ${response.statusText}`,
    );
  }

  const body = (await response.json()) as { features?: StacFeature[] };
  const features = body.features ?? [];

  return features.map((feature) => ({
    id: feature.id,
    datetime: feature.properties.datetime,
    sceneCloudCover: feature.properties["eo:cloud_cover"] ?? 100,
    epsg: feature.properties["proj:epsg"] ?? 0,
    hrefs: Object.fromEntries(
      Object.entries(feature.assets).map(([key, asset]) => [key, asset.href]),
    ),
  }));
}

/** True when a scene exposes every band the pipeline needs. */
export function hasRequiredBands(scene: Scene): boolean {
  return Object.values(BANDS).every((asset) => Boolean(scene.hrefs[asset]));
}

/**
 * Month-of-year distance between two acquisitions, 0..6.
 *
 * Seasonal mismatch is the dominant source of false positives — comparing
 * winter to summer reports every deciduous tree as vegetation loss — so the
 * pipeline warns when a pair is far apart in the seasonal cycle.
 */
export function seasonalDistanceMonths(a: string, b: string): number {
  const monthA = new Date(a).getUTCMonth();
  const monthB = new Date(b).getUTCMonth();
  const raw = Math.abs(monthA - monthB);
  return Math.min(raw, 12 - raw);
}
