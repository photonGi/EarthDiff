import { Suspense } from "react";

import { ExplorerPanel } from "@/components/explore/explorer-panel";
import { PRESETS } from "@/lib/presets";

export default function ExplorePage() {
  const presets = PRESETS.map((p) => ({
    slug: p.slug,
    title: p.title,
    subtitle: p.subtitle,
  }));

  return (
    <div className="min-h-screen">
      <Suspense
        fallback={
          <div className="px-6 py-12 text-sm text-muted">Loading explorer…</div>
        }
      >
        <ExplorerPanel presets={presets} />
      </Suspense>
    </div>
  );
}
