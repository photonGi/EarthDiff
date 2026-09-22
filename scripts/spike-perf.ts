/**
 * Performance spike: measure the real IO shape of one analysis.
 *
 * The first spike proved a windowed read works but took 5.1s for a single
 * band. The pipeline needs five bands across two dates, so the question that
 * decides the architecture is whether those reads parallelise and how much
 * reading an overview level instead of full resolution buys us.
 *
 * Budget: Vercel's function ceiling. If this lands well under it, the
 * single-runtime design holds; if not, the imagery work moves to a container.
 */

import { fromUrl, type GeoTIFF } from "geotiff";

import { BANDS, searchScenes, type Scene } from "../src/lib/stac";

/** ~11 km box over the Amazon near Manaus. */
const BBOX = { west: -60.05, south: -3.15, east: -59.95, north: -3.05 };

/** Cap on returned raster edge length, enforced by choosing an overview. */
const MAX_EDGE = 512;

type ReadResult = {
  band: string;
  level: number;
  width: number;
  height: number;
  ms: number;
};

/** Pick the overview level whose resolution is closest above our target. */
async function chooseLevel(tiff: GeoTIFF, targetEdge: number) {
  const count = await tiff.getImageCount();
  for (let level = count - 1; level >= 0; level -= 1) {
    const image = await tiff.getImage(level);
    if (image.getWidth() >= targetEdge) return { level, image };
  }
  return { level: 0, image: await tiff.getImage(0) };
}

async function readBand(
  scene: Scene,
  band: string,
  fraction: number,
): Promise<ReadResult> {
  const started = Date.now();
  const tiff = await fromUrl(scene.hrefs[band]);

  // The scene is 10980px across ~110km; our box is ~1% of that edge.
  const full = await tiff.getImage(0);
  const targetEdge = Math.max(64, Math.round(full.getWidth() * fraction));
  const { level, image } = await chooseLevel(tiff, Math.min(targetEdge, MAX_EDGE));

  const scale = image.getWidth() / full.getWidth();
  const x0 = Math.round(full.getWidth() * 0.45 * scale);
  const y0 = Math.round(full.getHeight() * 0.45 * scale);
  const edge = Math.min(MAX_EDGE, Math.round(targetEdge * scale) || 64);

  const rasters = await image.readRasters({
    window: [x0, y0, x0 + edge, y0 + edge],
    interleave: false,
  });

  const data = rasters[0] as ArrayLike<number>;

  return {
    band,
    level,
    width: edge,
    height: edge,
    ms: Date.now() - started,
    ...(data.length === 0 ? { empty: true } : {}),
  };
}

async function main() {
  console.log("1. STAC search for two date windows\n");

  const searchStarted = Date.now();
  const [before, after] = await Promise.all([
    searchScenes({
      bbox: BBOX,
      start: new Date("2023-07-01"),
      end: new Date("2023-09-15"),
    }),
    searchScenes({
      bbox: BBOX,
      start: new Date("2024-07-01"),
      end: new Date("2024-09-15"),
    }),
  ]);
  console.log(
    `   found ${before.length} + ${after.length} scenes in ${Date.now() - searchStarted}ms`,
  );

  const sceneA = before[0];
  const sceneB = after[0];
  console.log(
    `   before: ${sceneA.id} (${sceneA.sceneCloudCover.toFixed(1)}% cloud, epsg ${sceneA.epsg})`,
  );
  console.log(
    `   after:  ${sceneB.id} (${sceneB.sceneCloudCover.toFixed(1)}% cloud, epsg ${sceneB.epsg})`,
  );

  const bands = [BANDS.red, BANDS.green, BANDS.nir, BANDS.swir16, BANDS.scl];

  console.log("\n2. Serial read of one band (baseline)\n");
  const serial = await readBand(sceneA, BANDS.red, 0.01);
  console.log(
    `   ${serial.band}: level ${serial.level}, ${serial.width}x${serial.height}, ${serial.ms}ms`,
  );

  console.log("\n3. Parallel read: 5 bands x 2 dates = 10 reads\n");
  const parallelStarted = Date.now();
  const results = await Promise.all([
    ...bands.map((band) => readBand(sceneA, band, 0.01)),
    ...bands.map((band) => readBand(sceneB, band, 0.01)),
  ]);
  const parallelMs = Date.now() - parallelStarted;

  for (const r of results) {
    console.log(
      `   ${r.band.padEnd(8)} level ${r.level}  ${r.width}x${r.height}  ${r.ms}ms`,
    );
  }

  const slowest = Math.max(...results.map((r) => r.ms));
  console.log(`\n   wall clock for all 10 reads: ${parallelMs}ms`);
  console.log(`   slowest single read: ${slowest}ms`);
  console.log(
    `   serial equivalent would be ~${results.reduce((sum, r) => sum + r.ms, 0)}ms`,
  );
}

main().catch((error) => {
  console.error("SPIKE FAILED:", error);
  process.exit(1);
});
