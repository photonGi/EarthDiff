/**
 * End-to-end spike for the detection core.
 *
 * Runs the full staged pipeline over a known deforestation frontier and writes
 * PNGs so results can be checked by eye rather than trusted from a number.
 * Reports how much of the raw flagged area was noise, which is the measurement
 * that justifies the cleanup stages existing at all.
 *
 * Writes to tmp/, which is gitignored.
 */

import { mkdir } from "node:fs/promises";

import sharp from "sharp";

import { BANDS, searchScenes, seasonalDistanceMonths } from "../src/lib/stac";
import {
  readBandWindow,
  readVisual,
  resampleNearest,
  type RasterWindow,
} from "../src/lib/raster/read";
import { buildValidMask, computeIndices, MIN_COVERAGE } from "../src/lib/raster/indices";
import { detectChange, type ChangeClass } from "../src/lib/raster/detect";

/** Rondônia, Brazil — a long-documented deforestation frontier. */
const BBOX = { west: -62.35, south: -9.45, east: -62.15, north: -9.25 };

const OUT = "tmp";

/** Overlay colours, matching the palette in the design spec. */
const CLASS_COLOUR: Record<ChangeClass, [number, number, number]> = {
  vegetation_cleared: [251, 146, 60],
  vegetation_flooded: [56, 189, 248],
  vegetation_gain: [74, 222, 128],
  water_new: [59, 130, 246],
  water_receded: [214, 188, 138],
  bare_or_built: [167, 139, 250],
  unclassified: [156, 163, 175],
};

async function main() {
  await mkdir(OUT, { recursive: true });

  console.log("1. Finding the clearest pass in each window\n");
  const [beforeScenes, afterScenes] = await Promise.all([
    searchScenes({
      bbox: BBOX,
      start: new Date("2019-07-01"),
      end: new Date("2019-09-15"),
    }),
    searchScenes({
      bbox: BBOX,
      start: new Date("2024-07-01"),
      end: new Date("2024-09-15"),
    }),
  ]);

  const before = beforeScenes[0];
  const after = afterScenes[0];

  console.log(`   before ${before.id}  ${before.datetime.slice(0, 10)}`);
  console.log(`   after  ${after.id}  ${after.datetime.slice(0, 10)}`);
  console.log(
    `   seasonal distance ${seasonalDistanceMonths(before.datetime, after.datetime)} months`,
  );

  console.log("\n2. Reading bands in parallel\n");
  const started = Date.now();
  const reads = await Promise.all([
    readBandWindow(before.hrefs[BANDS.red], BBOX, before.epsg),
    readBandWindow(before.hrefs[BANDS.green], BBOX, before.epsg),
    readBandWindow(before.hrefs[BANDS.nir], BBOX, before.epsg),
    readBandWindow(before.hrefs[BANDS.swir16], BBOX, before.epsg),
    readBandWindow(before.hrefs[BANDS.scl], BBOX, before.epsg),
    readBandWindow(after.hrefs[BANDS.red], BBOX, after.epsg),
    readBandWindow(after.hrefs[BANDS.green], BBOX, after.epsg),
    readBandWindow(after.hrefs[BANDS.nir], BBOX, after.epsg),
    readBandWindow(after.hrefs[BANDS.swir16], BBOX, after.epsg),
    readBandWindow(after.hrefs[BANDS.scl], BBOX, after.epsg),
    readVisual(before.hrefs[BANDS.visual], BBOX, before.epsg),
    readVisual(after.hrefs[BANDS.visual], BBOX, after.epsg),
  ]);

  const [bRed, bGreen, bNir, bSwir, bScl, aRed, aGreen, aNir, aSwir, aScl] =
    reads.slice(0, 10) as RasterWindow[];
  const bVis = reads[10] as Awaited<ReturnType<typeof readVisual>>;
  const aVis = reads[11] as Awaited<ReturnType<typeof readVisual>>;

  console.log(`   12 reads in ${Date.now() - started}ms`);

  const width = Math.min(bRed.width, aRed.width);
  const height = Math.min(bRed.height, aRed.height);
  const mpp = bRed.metresPerPixel;
  console.log(`   grid ${width}x${height} at ${mpp.toFixed(1)}m/px (level ${bRed.level})`);
  console.log(`   ground extent ~${((width * mpp) / 1000).toFixed(1)}km across`);

  console.log("\n3. Cloud masking\n");
  const { valid, coverage } = buildValidMask(
    resampleNearest(bScl, width, height),
    resampleNearest(aScl, width, height),
  );
  console.log(`   usable in both dates: ${(coverage * 100).toFixed(1)}%`);
  if (coverage < MIN_COVERAGE) {
    console.log("   -> REFUSE: insufficient clear overlap");
    return;
  }

  console.log("\n4. Indices and staged detection\n");
  const beforeIdx = computeIndices({
    red: resampleNearest(bRed, width, height),
    green: resampleNearest(bGreen, width, height),
    nir: resampleNearest(bNir, width, height),
    swir16: resampleNearest(bSwir, width, height),
  });
  const afterIdx = computeIndices({
    red: resampleNearest(aRed, width, height),
    green: resampleNearest(aGreen, width, height),
    nir: resampleNearest(aNir, width, height),
    swir16: resampleNearest(aSwir, width, height),
  });

  const result = detectChange({
    before: beforeIdx,
    after: afterIdx,
    valid,
    width,
    height,
    metresPerPixel: mpp,
    minHectares: 2,
  });

  const pixelHa = mpp ** 2 / 10_000;
  console.log(
    `   NDVI median shift ${result.stats.ndvi.median.toFixed(4)}, MAD ${result.stats.ndvi.mad.toFixed(4)}`,
  );
  console.log(
    `   raw flagged:     ${result.rawFlagged} px = ${(result.rawFlagged * pixelHa).toFixed(0)} ha`,
  );
  console.log(
    `   after cleanup:   ${result.cleanedFlagged} px = ${(result.cleanedFlagged * pixelHa).toFixed(0)} ha`,
  );
  const removed = 1 - result.cleanedFlagged / Math.max(1, result.rawFlagged);
  console.log(`   noise removed:   ${(removed * 100).toFixed(1)}% of raw flags`);
  console.log(`   regions kept:    ${result.regions.length}`);

  console.log("\n5. Change by class\n");
  const sorted = Object.entries(result.totals).sort(
    (a, b) => b[1].hectares - a[1].hectares,
  );
  for (const [cls, total] of sorted) {
    console.log(
      `   ${cls.padEnd(20)} ${total.hectares.toFixed(0).padStart(6)} ha  (${total.regions} regions)`,
    );
  }

  const largest = [...result.regions].sort((a, b) => b.hectares - a.hectares)[0];
  if (largest) {
    console.log(
      `\n   largest region: ${largest.hectares.toFixed(0)} ha, ${largest.class}, ` +
        `mean dNDVI ${largest.meanNdvi.toFixed(3)}`,
    );
  }

  console.log("\n6. Writing PNGs to tmp/\n");

  // Colour-coded overlay on transparent background.
  const overlay = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const label = result.labels[i];
    if (label === -1) continue;
    const [r, g, b] = CLASS_COLOUR[result.regions[label].class];
    overlay[i * 4] = r;
    overlay[i * 4 + 1] = g;
    overlay[i * 4 + 2] = b;
    overlay[i * 4 + 3] = 235;
  }

  // The after image with the overlay composited, as the UI will show it.
  const afterResized = await sharp(Buffer.from(aVis.rgb), {
    raw: { width: aVis.width, height: aVis.height, channels: 3 },
  })
    .resize(width, height, { fit: "fill" })
    .png()
    .toBuffer();

  await Promise.all([
    sharp(Buffer.from(bVis.rgb), {
      raw: { width: bVis.width, height: bVis.height, channels: 3 },
    })
      .png()
      .toFile(`${OUT}/1-before.png`),
    sharp(Buffer.from(aVis.rgb), {
      raw: { width: aVis.width, height: aVis.height, channels: 3 },
    })
      .png()
      .toFile(`${OUT}/2-after.png`),
    sharp(Buffer.from(overlay), { raw: { width, height, channels: 4 } })
      .png()
      .toFile(`${OUT}/3-overlay.png`),
    sharp(afterResized)
      .composite([
        {
          input: await sharp(Buffer.from(overlay), {
            raw: { width, height, channels: 4 },
          })
            .png()
            .toBuffer(),
        },
      ])
      .png()
      .toFile(`${OUT}/4-composited.png`),
  ]);

  console.log("   1-before.png  2-after.png  3-overlay.png  4-composited.png");
}

main().catch((error) => {
  console.error("SPIKE FAILED:", error);
  process.exit(1);
});
