import { BANDS, searchScenes, seasonalDistanceMonths, type BoundingBox } from "../stac";
import {
  readBandWindow,
  resampleNearest,
  type RasterWindow,
} from "../raster/read";
import { buildValidMask, computeIndices, MIN_COVERAGE } from "../raster/indices";
import { detectChange, type DetectResult } from "../raster/detect";

export type AnalysisProgress =
  | "searching_scenes"
  | "reading_bands"
  | "masking"
  | "detecting"
  | "complete"
  | "failed";

export type AnalysisRequest = {
  bbox: BoundingBox;
  beforeStart: Date;
  beforeEnd: Date;
  afterStart: Date;
  afterEnd: Date;
  minHectares?: number;
};

export type AnalysisResult = {
  status: "complete" | "refused";
  progress: AnalysisProgress;
  beforeSceneId: string;
  afterSceneId: string;
  beforeDate: string;
  afterDate: string;
  seasonalDistanceMonths: number;
  coverage: number;
  grid: { width: number; height: number; metresPerPixel: number };
  detection: DetectResult;
  warnings: string[];
  elapsedMs: number;
};

export class AnalysisError extends Error {
  constructor(
    message: string,
    readonly code: "no_scenes" | "low_coverage" | "pipeline",
  ) {
    super(message);
    this.name = "AnalysisError";
  }
}

async function readSceneBands(
  hrefs: Record<string, string>,
  epsg: number,
  bbox: BoundingBox,
): Promise<{
  red: RasterWindow;
  green: RasterWindow;
  nir: RasterWindow;
  swir: RasterWindow;
  scl: RasterWindow;
}> {
  const [red, green, nir, swir, scl] = await Promise.all([
    readBandWindow(hrefs[BANDS.red], bbox, epsg),
    readBandWindow(hrefs[BANDS.green], bbox, epsg),
    readBandWindow(hrefs[BANDS.nir], bbox, epsg),
    readBandWindow(hrefs[BANDS.swir16], bbox, epsg),
    readBandWindow(hrefs[BANDS.scl], bbox, epsg),
  ]);
  return { red, green, nir, swir, scl };
}

export async function runAnalysis(request: AnalysisRequest): Promise<AnalysisResult> {
  const started = Date.now();
  const warnings: string[] = [];

  const [beforeScenes, afterScenes] = await Promise.all([
    searchScenes({
      bbox: request.bbox,
      start: request.beforeStart,
      end: request.beforeEnd,
    }),
    searchScenes({
      bbox: request.bbox,
      start: request.afterStart,
      end: request.afterEnd,
    }),
  ]);

  const before = beforeScenes[0];
  const after = afterScenes[0];
  if (!before || !after) {
    throw new AnalysisError(
      "No clear Sentinel-2 scene found in one or both date windows. Try widening the range.",
      "no_scenes",
    );
  }

  const seasonal = seasonalDistanceMonths(before.datetime, after.datetime);
  if (seasonal >= 3) {
    warnings.push(
      `Scenes are ${seasonal} months apart in the calendar — seasonal vegetation change may inflate false positives.`,
    );
  }

  const beforeBands = await readSceneBands(before.hrefs, before.epsg, request.bbox);
  const afterBands = await readSceneBands(after.hrefs, after.epsg, request.bbox);

  const width = Math.min(beforeBands.red.width, afterBands.red.width);
  const height = Math.min(beforeBands.red.height, afterBands.red.height);
  const mpp = beforeBands.red.metresPerPixel;

  const { valid, coverage } = buildValidMask(
    resampleNearest(beforeBands.scl, width, height),
    resampleNearest(afterBands.scl, width, height),
  );

  if (coverage < MIN_COVERAGE) {
    throw new AnalysisError(
      `Only ${(coverage * 100).toFixed(0)}% of the area is clear in both dates (need ${MIN_COVERAGE * 100}%). Widen the date windows or choose a smaller box.`,
      "low_coverage",
    );
  }

  const beforeIdx = computeIndices({
    red: resampleNearest(beforeBands.red, width, height),
    green: resampleNearest(beforeBands.green, width, height),
    nir: resampleNearest(beforeBands.nir, width, height),
    swir16: resampleNearest(beforeBands.swir, width, height),
  });
  const afterIdx = computeIndices({
    red: resampleNearest(afterBands.red, width, height),
    green: resampleNearest(afterBands.green, width, height),
    nir: resampleNearest(afterBands.nir, width, height),
    swir16: resampleNearest(afterBands.swir, width, height),
  });

  const detection = detectChange({
    before: beforeIdx,
    after: afterIdx,
    valid,
    width,
    height,
    metresPerPixel: mpp,
    minHectares: request.minHectares ?? 2,
  });

  return {
    status: "complete",
    progress: "complete",
    beforeSceneId: before.id,
    afterSceneId: after.id,
    beforeDate: before.datetime,
    afterDate: after.datetime,
    seasonalDistanceMonths: seasonal,
    coverage,
    grid: { width, height, metresPerPixel: mpp },
    detection,
    warnings,
    elapsedMs: Date.now() - started,
  };
}
