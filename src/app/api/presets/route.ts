import { PRESETS } from "@/lib/presets";

export const runtime = "nodejs";

export function GET() {
  return Response.json({
    presets: PRESETS.map((p) => ({
      slug: p.slug,
      title: p.title,
      subtitle: p.subtitle,
      bbox: p.bbox,
      beforeStart: p.beforeStart,
      beforeEnd: p.beforeEnd,
      afterStart: p.afterStart,
      afterEnd: p.afterEnd,
      sourceUrl: p.sourceUrl,
    })),
  });
}
