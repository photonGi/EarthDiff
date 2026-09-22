import sharp from "sharp";

import { CHANGE_CLASS_COLOR } from "../change-classes";
import type { DetectResult } from "../raster/detect";

function buildOverlayRgba(
  detection: DetectResult,
  width: number,
  height: number,
): Uint8Array {
  const overlay = new Uint8Array(width * height * 4);

  for (let i = 0; i < width * height; i += 1) {
    const label = detection.labels[i];
    if (label === -1) continue;

    const region = detection.regions[label];
    const [r, g, b] = CHANGE_CLASS_COLOR[region.class];
    overlay[i * 4] = r;
    overlay[i * 4 + 1] = g;
    overlay[i * 4 + 2] = b;
    overlay[i * 4 + 3] = 220;
  }

  return overlay;
}

async function resizeRgb(
  rgb: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): Promise<Buffer> {
  if (sourceWidth === targetWidth && sourceHeight === targetHeight) {
    return sharp(Buffer.from(rgb), {
      raw: { width: sourceWidth, height: sourceHeight, channels: 3 },
    })
      .png({ compressionLevel: 8 })
      .toBuffer();
  }

  return sharp(Buffer.from(rgb), {
    raw: { width: sourceWidth, height: sourceHeight, channels: 3 },
  })
    .resize(targetWidth, targetHeight, { fit: "fill" })
    .png({ compressionLevel: 8 })
    .toBuffer();
}

export type EncodedImages = {
  before: string;
  after: string;
  composite: string;
};

export async function encodeAnalysisImages(options: {
  beforeRgb: Uint8Array;
  beforeWidth: number;
  beforeHeight: number;
  afterRgb: Uint8Array;
  afterWidth: number;
  afterHeight: number;
  detection: DetectResult;
  gridWidth: number;
  gridHeight: number;
}): Promise<EncodedImages> {
  const {
    beforeRgb,
    beforeWidth,
    beforeHeight,
    afterRgb,
    afterWidth,
    afterHeight,
    detection,
    gridWidth,
    gridHeight,
  } = options;

  const [beforePng, afterPng] = await Promise.all([
    resizeRgb(beforeRgb, beforeWidth, beforeHeight, gridWidth, gridHeight),
    resizeRgb(afterRgb, afterWidth, afterHeight, gridWidth, gridHeight),
  ]);

  const overlay = buildOverlayRgba(detection, gridWidth, gridHeight);
  const overlayPng = await sharp(Buffer.from(overlay), {
    raw: { width: gridWidth, height: gridHeight, channels: 4 },
  })
    .png({ compressionLevel: 8 })
    .toBuffer();

  const compositePng = await sharp(afterPng)
    .composite([{ input: overlayPng }])
    .png({ compressionLevel: 8 })
    .toBuffer();

  return {
    before: beforePng.toString("base64"),
    after: afterPng.toString("base64"),
    composite: compositePng.toString("base64"),
  };
}
