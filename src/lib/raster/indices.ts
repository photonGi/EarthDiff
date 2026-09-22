/**
 * Normalised difference indices and cloud masking.
 *
 * Each index is a ratio of two bands, which makes it largely insensitive to
 * overall illumination — the property that lets two satellite passes taken
 * months apart be compared at all.
 */

import type { IndexGrids } from "./detect";

/**
 * Scene classification codes that make a pixel unusable.
 *
 * 0 no-data, 1 saturated/defective, 3 cloud shadow, 8 cloud medium
 * probability, 9 cloud high probability, 10 thin cirrus, 11 snow or ice.
 * Vegetation, bare soil, and water classes are deliberately kept — they are
 * the subject, not an obstruction.
 */
const UNUSABLE_SCL = new Set([0, 1, 3, 8, 9, 10, 11]);

/** Normalised difference of two bands, guarding the zero-sum case. */
function normalisedDifference(
  a: Float32Array,
  b: Float32Array,
): Float32Array {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i += 1) {
    const sum = a[i] + b[i];
    out[i] = sum === 0 ? 0 : (a[i] - b[i]) / sum;
  }
  return out;
}

export type BandGrids = {
  red: Float32Array;
  green: Float32Array;
  nir: Float32Array;
  swir16: Float32Array;
};

export function computeIndices(bands: BandGrids): IndexGrids {
  return {
    /** Vegetation vigour: healthy canopy reflects near-infrared, absorbs red. */
    ndvi: normalisedDifference(bands.nir, bands.red),
    /** Surface water: water reflects green and absorbs near-infrared. */
    ndwi: normalisedDifference(bands.green, bands.nir),
    /** Bare ground and built surfaces, brighter in shortwave infrared. */
    ndbi: normalisedDifference(bands.swir16, bands.nir),
  };
}

/**
 * Pixels usable in *both* dates.
 *
 * Intersecting rather than unioning matters: a pixel clouded on either date
 * has no comparable pair, and reporting change there would be invention.
 */
export function buildValidMask(
  beforeScl: Float32Array,
  afterScl: Float32Array,
): { valid: Uint8Array; coverage: number } {
  const valid = new Uint8Array(beforeScl.length);
  let count = 0;

  for (let i = 0; i < valid.length; i += 1) {
    const usable =
      !UNUSABLE_SCL.has(beforeScl[i]) && !UNUSABLE_SCL.has(afterScl[i]);
    valid[i] = usable ? 1 : 0;
    if (usable) count += 1;
  }

  return { valid, coverage: count / valid.length };
}

/**
 * Minimum share of the requested area that must be clear in both dates.
 *
 * Below this the analysis refuses instead of reporting change measured over a
 * handful of visible pixels.
 */
export const MIN_COVERAGE = 0.6;
