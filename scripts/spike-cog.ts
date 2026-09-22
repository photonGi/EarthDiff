/**
 * Architecture spike: prove a windowed read of a remote Cloud-Optimised GeoTIFF
 * works from Node, and that overview levels let us bound output resolution
 * independently of the requested area.
 *
 * This is the assumption the whole single-runtime design rests on. If it fails,
 * the imagery pipeline has to move to a Python service and the design changes.
 */

import { fromUrl } from "geotiff";

const B04 =
  "https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/20/M/RB/2024/8/S2B_20MRB_20240829_0_L2A/B04.tif";

async function main() {
  const started = Date.now();

  const tiff = await fromUrl(B04);
  const count = await tiff.getImageCount();
  console.log(`overview levels: ${count}`);

  for (let i = 0; i < count; i += 1) {
    const img = await tiff.getImage(i);
    console.log(
      `  level ${i}: ${img.getWidth()} x ${img.getHeight()} ` +
        `tile ${img.getTileWidth()}x${img.getTileHeight()}`,
    );
  }

  const full = await tiff.getImage(0);
  console.log(`\nfull resolution: ${full.getWidth()} x ${full.getHeight()}`);
  console.log(`bbox (scene CRS): ${full.getBoundingBox().join(", ")}`);
  console.log(`samples per pixel: ${full.getSamplesPerPixel()}`);

  // Read a 512x512 window from the middle of the scene.
  const x0 = 5000;
  const y0 = 5000;
  const size = 512;

  const readStarted = Date.now();
  const rasters = await full.readRasters({
    window: [x0, y0, x0 + size, y0 + size],
    interleave: false,
  });
  const readMs = Date.now() - readStarted;

  const band = rasters[0] as Uint16Array;
  console.log(`\nwindow read: ${size}x${size} in ${readMs}ms`);
  console.log(`values returned: ${band.length} (expected ${size * size})`);

  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let zeros = 0;
  for (const v of band) {
    if (v === 0) zeros += 1;
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }

  console.log(
    `reflectance range: ${min}..${max}, mean ${(sum / band.length).toFixed(1)}, ` +
      `${((zeros / band.length) * 100).toFixed(1)}% zero`,
  );

  console.log(`\ntotal elapsed: ${Date.now() - started}ms`);
}

main().catch((error) => {
  console.error("SPIKE FAILED:", error);
  process.exit(1);
});
