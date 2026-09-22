import type { ChangeClass } from "./raster/detect";

/** Overlay colours — must stay distinguishable on satellite imagery. */
export const CHANGE_CLASS_COLOR: Record<
  ChangeClass,
  [number, number, number]
> = {
  vegetation_cleared: [251, 146, 60],
  vegetation_flooded: [56, 189, 248],
  vegetation_gain: [74, 222, 128],
  water_new: [59, 130, 246],
  water_receded: [214, 188, 138],
  bare_or_built: [167, 139, 250],
  unclassified: [156, 163, 175],
};

export const CHANGE_CLASS_LABEL: Record<ChangeClass, string> = {
  vegetation_cleared: "Vegetation cleared",
  vegetation_flooded: "Vegetation flooded",
  vegetation_gain: "Vegetation gain",
  water_new: "New water",
  water_receded: "Water receded",
  bare_or_built: "Bare or built",
  unclassified: "Unclassified",
};

export function isChangeClass(value: string): value is ChangeClass {
  return value in CHANGE_CLASS_LABEL;
}
