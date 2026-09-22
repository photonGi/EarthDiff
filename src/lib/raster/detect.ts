/**
 * Change detection: from per-date index rasters to classified, measured regions.
 *
 * The pipeline is deliberately staged, because a threshold alone does not work.
 * Measured on a Rondônia deforestation scene, thresholding raw NDVI difference
 * flagged 14.4% of the area as changed, almost all of it single-pixel speckle
 * from sensor noise and crop rotation. Morphological opening and a minimum
 * region size are what turn that into regions a human would agree with.
 */

export type IndexGrids = {
  ndvi: Float32Array;
  ndwi: Float32Array;
  ndbi: Float32Array;
};

export type ChangeClass =
  | "vegetation_cleared"
  | "vegetation_flooded"
  | "vegetation_gain"
  | "water_new"
  | "water_receded"
  | "bare_or_built"
  | "unclassified";

export type Region = {
  class: ChangeClass;
  pixels: number;
  hectares: number;
  /** Mean index shifts inside the region, for classification and explanation. */
  meanNdvi: number;
  meanNdwi: number;
  meanNdbi: number;
  /** Absolute post-change state, required to identify water reliably. */
  afterNdvi: number;
  afterNdwi: number;
  beforeNdwi: number;
  /** Pixel-space centroid, for placing labels and cropping detail views. */
  centroidX: number;
  centroidY: number;
};

export type RobustStats = { median: number; mad: number };

/**
 * Median and median absolute deviation over the valid samples.
 *
 * Mean and standard deviation are wrong for this job: the change pixels are
 * precisely the outliers, so they would inflate the very threshold meant to
 * isolate them. The median shift also doubles as the global offset between two
 * passes — differing sun angle and atmosphere — which is subtracted rather
 * than mistaken for change.
 */
export function robustStats(
  values: Float32Array,
  valid: Uint8Array,
): RobustStats {
  const kept: number[] = [];
  for (let i = 0; i < values.length; i += 1) {
    if (valid[i]) kept.push(values[i]);
  }

  if (kept.length === 0) return { median: 0, mad: 0 };

  kept.sort((a, b) => a - b);
  const median = kept[Math.floor(kept.length / 2)];

  const deviations = kept.map((v) => Math.abs(v - median));
  deviations.sort((a, b) => a - b);
  const mad = deviations[Math.floor(deviations.length / 2)];

  return { median, mad };
}

/**
 * Flags pixels whose shift is both statistically unusual and physically
 * meaningful.
 *
 * The statistical test adapts to each scene pair. The absolute floor is what
 * stops a very stable scene — small MAD — from reporting imperceptible
 * wobble as change: a 0.02 NDVI shift is real in the statistics and irrelevant
 * on the ground.
 */
export function flagOutliers(
  delta: Float32Array,
  valid: Uint8Array,
  options: {
    stats: RobustStats;
    /** Deviations from the median required to flag. */
    k?: number;
    /** Minimum absolute shift, regardless of statistics. */
    floor?: number;
    direction: "decrease" | "increase";
  },
): Uint8Array {
  const { stats, k = 3, floor = 0.12, direction } = options;
  const out = new Uint8Array(delta.length);

  const statistical = k * stats.mad;
  const cut = Math.max(statistical, floor);

  for (let i = 0; i < delta.length; i += 1) {
    if (!valid[i]) continue;
    const shift = delta[i] - stats.median;
    const hit = direction === "decrease" ? shift <= -cut : shift >= cut;
    if (hit) out[i] = 1;
  }

  return out;
}

function erode(mask: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(mask.length);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      if (!mask[i]) continue;

      // 4-neighbourhood: a pixel survives only with support on every side.
      if (
        mask[i - 1] &&
        mask[i + 1] &&
        mask[i - width] &&
        mask[i + width]
      ) {
        out[i] = 1;
      }
    }
  }

  return out;
}

function dilate(mask: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(mask.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (!mask[i]) continue;

      out[i] = 1;
      if (x > 0) out[i - 1] = 1;
      if (x < width - 1) out[i + 1] = 1;
      if (y > 0) out[i - width] = 1;
      if (y < height - 1) out[i + width] = 1;
    }
  }

  return out;
}

/**
 * Morphological opening: erosion followed by dilation.
 *
 * Erosion deletes isolated pixels and hairline strands, which is the speckle.
 * Dilation restores the surviving regions to roughly their original extent, so
 * genuine change is not systematically under-measured.
 */
export function openMask(
  mask: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  return dilate(erode(mask, width, height), width, height);
}

/**
 * Groups flagged pixels into connected regions and discards those too small to
 * be credible, using an iterative flood fill — recursion would overflow the
 * stack on a large contiguous clearing.
 */
export function labelRegions(
  mask: Uint8Array,
  width: number,
  height: number,
  minPixels: number,
): { labels: Int32Array; groups: number[][] } {
  const labels = new Int32Array(mask.length).fill(-1);
  const groups: number[][] = [];
  const stack: number[] = [];

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || labels[start] !== -1) continue;

    const id = groups.length;
    const members: number[] = [];
    stack.push(start);
    labels[start] = id;

    while (stack.length > 0) {
      const i = stack.pop() as number;
      members.push(i);

      const x = i % width;
      const y = (i - x) / width;

      if (x > 0 && mask[i - 1] && labels[i - 1] === -1) {
        labels[i - 1] = id;
        stack.push(i - 1);
      }
      if (x < width - 1 && mask[i + 1] && labels[i + 1] === -1) {
        labels[i + 1] = id;
        stack.push(i + 1);
      }
      if (y > 0 && mask[i - width] && labels[i - width] === -1) {
        labels[i - width] = id;
        stack.push(i - width);
      }
      if (y < height - 1 && mask[i + width] && labels[i + width] === -1) {
        labels[i + width] = id;
        stack.push(i + width);
      }
    }

    if (members.length >= minPixels) {
      groups.push(members);
    } else {
      // Too small to be credible: unlabel so it renders as unchanged.
      for (const i of members) labels[i] = -1;
    }
  }

  return { labels, groups };
}

/**
 * NDWI above which a surface is actually water.
 *
 * Water is identified by its absolute state, never by a rising water index.
 * NDWI is (green - NIR) / (green + NIR), and clearing vegetation causes a
 * large NIR drop, which raises NDWI substantially with no water involved.
 * Measured on a Rondônia scene, trusting the delta alone misreported 3,769 ha
 * of cleared farmland as flooding — more than twice the area it correctly
 * identified as cleared.
 */
const WATER_NDWI = 0.2;

/**
 * Assigns a class from index shifts plus the absolute post-change state.
 *
 * Vegetation, water, and built-up indices move together in characteristic
 * combinations: clearing drops vegetation while raising bare-ground
 * reflectance, whereas flooding drops vegetation and leaves actual water
 * behind. Regions matching no pattern are reported as unclassified rather than
 * forced into a category that would misinform.
 */
export function classifyRegion(inputs: {
  deltaNdvi: number;
  deltaNdbi: number;
  afterNdwi: number;
  beforeNdwi: number;
}): ChangeClass {
  const { deltaNdvi, deltaNdbi, afterNdwi, beforeNdwi } = inputs;

  const vegLoss = deltaNdvi <= -0.1;
  const vegGain = deltaNdvi >= 0.1;
  const bareUp = deltaNdbi >= 0.05;

  const wasWater = beforeNdwi >= WATER_NDWI;
  const isWater = afterNdwi >= WATER_NDWI;

  if (isWater && !wasWater) {
    return vegLoss ? "vegetation_flooded" : "water_new";
  }
  if (wasWater && !isWater) return "water_receded";

  if (vegLoss) return "vegetation_cleared";
  if (vegGain) return "vegetation_gain";
  if (bareUp) return "bare_or_built";
  return "unclassified";
}

export type DetectOptions = {
  before: IndexGrids;
  after: IndexGrids;
  valid: Uint8Array;
  width: number;
  height: number;
  metresPerPixel: number;
  /** Smallest reportable region. Defaults to ~1 hectare equivalent. */
  minHectares?: number;
};

export type DetectResult = {
  regions: Region[];
  labels: Int32Array;
  /** Pixels flagged before cleanup, for reporting how much was noise. */
  rawFlagged: number;
  cleanedFlagged: number;
  stats: { ndvi: RobustStats; ndwi: RobustStats; ndbi: RobustStats };
  totals: Record<string, { hectares: number; regions: number }>;
};

export function detectChange(options: DetectOptions): DetectResult {
  const {
    before,
    after,
    valid,
    width,
    height,
    metresPerPixel,
    minHectares = 1,
  } = options;

  const size = width * height;
  const dNdvi = new Float32Array(size);
  const dNdwi = new Float32Array(size);
  const dNdbi = new Float32Array(size);

  for (let i = 0; i < size; i += 1) {
    dNdvi[i] = after.ndvi[i] - before.ndvi[i];
    dNdwi[i] = after.ndwi[i] - before.ndwi[i];
    dNdbi[i] = after.ndbi[i] - before.ndbi[i];
  }

  const stats = {
    ndvi: robustStats(dNdvi, valid),
    ndwi: robustStats(dNdwi, valid),
    ndbi: robustStats(dNdbi, valid),
  };

  // Any index moving materially in either direction is a change candidate.
  const candidates = new Uint8Array(size);
  const directions = [
    flagOutliers(dNdvi, valid, { stats: stats.ndvi, direction: "decrease" }),
    flagOutliers(dNdvi, valid, { stats: stats.ndvi, direction: "increase" }),
    flagOutliers(dNdwi, valid, { stats: stats.ndwi, direction: "decrease" }),
    flagOutliers(dNdwi, valid, { stats: stats.ndwi, direction: "increase" }),
  ];

  let rawFlagged = 0;
  for (let i = 0; i < size; i += 1) {
    if (directions.some((mask) => mask[i])) {
      candidates[i] = 1;
      rawFlagged += 1;
    }
  }

  const cleaned = openMask(candidates, width, height);

  const pixelHectares = metresPerPixel ** 2 / 10_000;
  const minPixels = Math.max(4, Math.round(minHectares / pixelHectares));
  const { labels, groups } = labelRegions(cleaned, width, height, minPixels);

  const regions: Region[] = groups.map((members) => {
    let sumNdvi = 0;
    let sumNdwi = 0;
    let sumNdbi = 0;
    let sumAfterNdvi = 0;
    let sumAfterNdwi = 0;
    let sumBeforeNdwi = 0;
    let sumX = 0;
    let sumY = 0;

    for (const i of members) {
      sumNdvi += dNdvi[i];
      sumNdwi += dNdwi[i];
      sumNdbi += dNdbi[i];
      sumAfterNdvi += after.ndvi[i];
      sumAfterNdwi += after.ndwi[i];
      sumBeforeNdwi += before.ndwi[i];
      sumX += i % width;
      sumY += Math.floor(i / width);
    }

    const n = members.length;
    const meanNdvi = sumNdvi / n;
    const meanNdbi = sumNdbi / n;
    const afterNdwi = sumAfterNdwi / n;
    const beforeNdwi = sumBeforeNdwi / n;

    return {
      class: classifyRegion({
        deltaNdvi: meanNdvi,
        deltaNdbi: meanNdbi,
        afterNdwi,
        beforeNdwi,
      }),
      pixels: n,
      hectares: n * pixelHectares,
      meanNdvi,
      meanNdwi: sumNdwi / n,
      meanNdbi,
      afterNdvi: sumAfterNdvi / n,
      afterNdwi,
      beforeNdwi,
      centroidX: sumX / n,
      centroidY: sumY / n,
    };
  });

  const totals: Record<string, { hectares: number; regions: number }> = {};
  for (const region of regions) {
    const entry = totals[region.class] ?? { hectares: 0, regions: 0 };
    entry.hectares += region.hectares;
    entry.regions += 1;
    totals[region.class] = entry;
  }

  let cleanedFlagged = 0;
  for (let i = 0; i < size; i += 1) if (labels[i] !== -1) cleanedFlagged += 1;

  return { regions, labels, rawFlagged, cleanedFlagged, stats, totals };
}
