/**
 * Windowed reads of Sentinel-2 Cloud-Optimised GeoTIFFs.
 *
 * A single band file is ~163 MB at full resolution, so nothing is ever read
 * whole. Two mechanisms keep the cost proportional to the area on screen
 * rather than the area on disk: HTTP range requests fetch only the tiles
 * covering the requested window, and overview levels cap the returned
 * resolution however large the request gets.
 */

import { fromUrl, type GeoTIFF, type GeoTIFFImage } from "geotiff";
import proj4 from "proj4";

import type { BoundingBox } from "../stac";

/**
 * Longest edge, in pixels, of any returned raster. Bounds both the transfer
 * and the per-pixel work downstream regardless of how large an area the user
 * asks for.
 */
export const MAX_EDGE = 512;

export type RasterWindow = {
  /** Overview level actually read; 0 is full resolution. */
  level: number;
  width: number;
  height: number;
  /** Ground sample distance of the returned data, in metres. */
  metresPerPixel: number;
  data: Float32Array;
};

/**
 * Builds a proj4 definition from a UTM EPSG code.
 *
 * Sentinel-2 scenes are tiled onto WGS84 UTM zones, which encode as 326xx for
 * northern and 327xx for southern hemisphere zones. Deriving the projection
 * arithmetically avoids shipping an EPSG database for six parameters.
 */
function utmDefinition(epsg: number): string {
  const zone = epsg % 100;
  const isSouth = epsg >= 32700 && epsg < 32800;

  if (zone < 1 || zone > 60) {
    throw new Error(`Unsupported projection for change detection: EPSG:${epsg}`);
  }

  return `+proj=utm +zone=${zone}${isSouth ? " +south" : ""} +datum=WGS84 +units=m +no_defs`;
}

/** The requested box, projected into a scene's native grid. */
export type ProjectedBox = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export function projectBox(bbox: BoundingBox, epsg: number): ProjectedBox {
  const target = utmDefinition(epsg);

  // All four corners, because a lat/lon rectangle is not a rectangle in UTM.
  const corners = [
    proj4("EPSG:4326", target, [bbox.west, bbox.south]),
    proj4("EPSG:4326", target, [bbox.east, bbox.south]),
    proj4("EPSG:4326", target, [bbox.east, bbox.north]),
    proj4("EPSG:4326", target, [bbox.west, bbox.north]),
  ];

  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);

  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

/**
 * Geo-referencing for a scene, read once from the full-resolution image.
 *
 * Overview IFDs in a COG carry no affine transform — asking them for a
 * bounding box throws — so every pixel coordinate is derived from level 0 and
 * scaled by the ratio of raster widths.
 */
type SceneGrid = {
  tiff: GeoTIFF;
  levels: number;
  baseWidth: number;
  baseHeight: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

async function openScene(href: string): Promise<SceneGrid> {
  const tiff = await fromUrl(href);
  const levels = await tiff.getImageCount();
  const base = await tiff.getImage(0);
  const [minX, minY, maxX, maxY] = base.getBoundingBox();

  return {
    tiff,
    levels,
    baseWidth: base.getWidth(),
    baseHeight: base.getHeight(),
    minX,
    minY,
    maxX,
    maxY,
  };
}

/**
 * Chooses the finest overview level whose pixel window still fits inside
 * MAX_EDGE, so we get the most detail available without an oversized transfer.
 */
async function selectLevel(
  grid: SceneGrid,
  box: ProjectedBox,
): Promise<{ level: number; image: GeoTIFFImage; metresPerPixel: number }> {
  const sceneWidthMetres = grid.maxX - grid.minX;
  const spanMetres = Math.max(box.maxX - box.minX, box.maxY - box.minY);
  const requiredMetresPerPixel = spanMetres / MAX_EDGE;

  let chosen: { level: number; image: GeoTIFFImage; metresPerPixel: number } | null =
    null;

  // Levels run fine to coarse; walk coarse to fine and keep the last that fits.
  for (let level = grid.levels - 1; level >= 0; level -= 1) {
    const image = await grid.tiff.getImage(level);
    const metresPerPixel = sceneWidthMetres / image.getWidth();
    if (metresPerPixel >= requiredMetresPerPixel) {
      chosen = { level, image, metresPerPixel };
    }
  }

  if (chosen) return chosen;

  // Requested area is smaller than one full-resolution pixel span allows.
  const image = await grid.tiff.getImage(0);
  return {
    level: 0,
    image,
    metresPerPixel: sceneWidthMetres / grid.baseWidth,
  };
}

/**
 * Converts a projected box into integer pixel bounds on a given level's grid.
 *
 * Coordinates are computed against the level-0 transform and then scaled,
 * because overview levels are not georeferenced.
 */
function pixelWindow(
  grid: SceneGrid,
  image: GeoTIFFImage,
  box: ProjectedBox,
): [number, number, number, number] {
  const scale = image.getWidth() / grid.baseWidth;
  const xScale = (grid.baseWidth / (grid.maxX - grid.minX)) * scale;
  const yScale = (grid.baseHeight / (grid.maxY - grid.minY)) * scale;

  // Rasters are north-up: pixel row 0 is the maximum northing.
  let x0 = Math.floor((box.minX - grid.minX) * xScale);
  let x1 = Math.ceil((box.maxX - grid.minX) * xScale);
  let y0 = Math.floor((grid.maxY - box.maxY) * yScale);
  let y1 = Math.ceil((grid.maxY - box.minY) * yScale);

  // Clamp into the raster, keeping at least one pixel of extent.
  x0 = Math.max(0, Math.min(x0, image.getWidth() - 1));
  y0 = Math.max(0, Math.min(y0, image.getHeight() - 1));
  x1 = Math.max(x0 + 1, Math.min(x1, image.getWidth()));
  y1 = Math.max(y0 + 1, Math.min(y1, image.getHeight()));

  return [x0, y0, x1, y1];
}

/**
 * Reads one band over the requested box.
 *
 * Returns Float32 regardless of the source type so downstream index maths does
 * not care whether it came from a 16-bit reflectance band or an 8-bit class
 * layer.
 */
export async function readBandWindow(
  href: string,
  bbox: BoundingBox,
  epsg: number,
  options: { sampleIndex?: number } = {},
): Promise<RasterWindow> {
  const grid = await openScene(href);
  const box = projectBox(bbox, epsg);
  const { level, image, metresPerPixel } = await selectLevel(grid, box);
  const window = pixelWindow(grid, image, box);

  const rasters = await image.readRasters({ window, interleave: false });
  const source = rasters[options.sampleIndex ?? 0] as ArrayLike<number>;

  const width = window[2] - window[0];
  const height = window[3] - window[1];

  const data = new Float32Array(source.length);
  for (let i = 0; i < source.length; i += 1) data[i] = source[i];

  return { level, width, height, metresPerPixel, data };
}

/**
 * Reads the three-band true-colour composite as interleaved RGB.
 *
 * The archive ships this alongside the raw bands, so the before/after display
 * costs no band arithmetic and no colour balancing of our own.
 */
export async function readVisual(
  href: string,
  bbox: BoundingBox,
  epsg: number,
): Promise<{ width: number; height: number; rgb: Uint8Array; level: number }> {
  const grid = await openScene(href);
  const box = projectBox(bbox, epsg);
  const { level, image } = await selectLevel(grid, box);
  const window = pixelWindow(grid, image, box);

  const raster = (await image.readRasters({
    window,
    interleave: true,
  })) as unknown as ArrayLike<number>;

  const width = window[2] - window[0];
  const height = window[3] - window[1];
  const samples = image.getSamplesPerPixel();

  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i += 1) {
    rgb[i * 3] = raster[i * samples];
    rgb[i * 3 + 1] = raster[i * samples + 1];
    rgb[i * 3 + 2] = raster[i * samples + 2];
  }

  return { width, height, rgb, level };
}

/**
 * Nearest-neighbour resample onto a target grid.
 *
 * The shortwave infrared and classification bands are 20 m where the visible
 * and near-infrared bands are 10 m, so they must be lifted onto the finer grid
 * before any per-pixel combination. Nearest neighbour is required for the
 * classification layer — interpolating category codes would invent classes
 * that do not exist — and is close enough for the 20 m reflectance band at the
 * resolutions we display.
 */
export function resampleNearest(
  source: RasterWindow,
  width: number,
  height: number,
): Float32Array {
  if (source.width === width && source.height === height) return source.data;

  const out = new Float32Array(width * height);
  const xRatio = source.width / width;
  const yRatio = source.height / height;

  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(source.height - 1, Math.floor(y * yRatio));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(source.width - 1, Math.floor(x * xRatio));
      out[y * width + x] = source.data[sourceY * source.width + sourceX];
    }
  }

  return out;
}
