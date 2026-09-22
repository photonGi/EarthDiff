import { z } from "zod";

import { AnalysisError, runAnalysis } from "@/lib/analysis/run";
import { getPreset } from "@/lib/presets";

export const runtime = "nodejs";
/** Hobby cap is 10s; Pro allows 60+. Analysis often needs 15–30s. */
export const maxDuration = 60;

const bboxSchema = z.object({
  west: z.number().min(-180).max(180),
  south: z.number().min(-90).max(90),
  east: z.number().min(-180).max(180),
  north: z.number().min(-90).max(90),
});

const bodySchema = z
  .object({
    preset: z.string().optional(),
    bbox: bboxSchema.optional(),
    beforeStart: z.string().min(4).optional(),
    beforeEnd: z.string().min(4).optional(),
    afterStart: z.string().min(4).optional(),
    afterEnd: z.string().min(4).optional(),
    minHectares: z.number().min(0.5).max(100).optional(),
  })
  .refine(
    (value) => value.preset || (value.bbox && value.beforeStart && value.afterStart),
    { message: "Provide preset or full bbox + date windows." },
  );

function parseDate(value: string): Date {
  return new Date(value.includes("T") ? value : `${value}T00:00:00.000Z`);
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const preset = input.preset ? getPreset(input.preset) : undefined;
  if (input.preset && !preset) {
    return Response.json({ error: "Unknown preset." }, { status: 404 });
  }

  const bbox = preset?.bbox ?? input.bbox!;
  const beforeStart = parseDate(preset?.beforeStart ?? input.beforeStart!);
  const beforeEnd = parseDate(preset?.beforeEnd ?? input.beforeEnd ?? input.beforeStart!);
  const afterStart = parseDate(preset?.afterStart ?? input.afterStart!);
  const afterEnd = parseDate(preset?.afterEnd ?? input.afterEnd ?? input.afterStart!);

  try {
    const result = await runAnalysis({
      bbox,
      beforeStart,
      beforeEnd,
      afterStart,
      afterEnd,
      minHectares: input.minHectares,
    });

    return Response.json({
      beforeSceneId: result.beforeSceneId,
      afterSceneId: result.afterSceneId,
      beforeDate: result.beforeDate,
      afterDate: result.afterDate,
      seasonalDistanceMonths: result.seasonalDistanceMonths,
      coverage: result.coverage,
      grid: result.grid,
      elapsedMs: result.elapsedMs,
      warnings: result.warnings,
      images: result.images,
      detection: {
        rawFlagged: result.detection.rawFlagged,
        cleanedFlagged: result.detection.cleanedFlagged,
        totals: result.detection.totals,
        regionCount: result.detection.regions.length,
      },
    });
  } catch (error) {
    if (error instanceof AnalysisError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.code === "low_coverage" ? 422 : 404 },
      );
    }
    console.error(error);
    return Response.json({ error: "Analysis failed unexpectedly." }, { status: 500 });
  }
}
