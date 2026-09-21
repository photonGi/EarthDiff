# EarthDiff — Design Spec

**Date:** 2026-09-21
**Status:** Approved (sections 1–3), architecture revised after hosting research
**Tagline:** git diff for the planet

## 1. Problem

Satellite imagery that can answer "what changed here?" is public, free, and
effectively unusable by normal people. The data sits behind coordinate reference
systems, tiling grids, cloud masks, and 160 MB files per spectral band. The
existing tools split into two camps: professional GIS software with a steep
learning curve, and commercial platforms that charge per hectare.

Meanwhile the questions are ordinary. Did this forest get cleared? Did the flood
reach this district? Has construction progressed since spring? Did the reservoir
refill?

EarthDiff answers those in one click, and — critically — reports numbers that
come from the pixels rather than from a language model.

## 2. Scope

A public, no-login web app. A visitor picks an area (curated preset, place
search, or a box drawn on a map) and two date windows. EarthDiff selects the
clearest satellite pass in each window and returns:

1. A before/after true-colour swipe slider.
2. A change overlay, coloured by change type.
3. Per-class statistics in hectares.
4. A plain-language interpretation, grounded in those statistics.
5. A permanent shareable link with a generated social preview image.

### Non-goals for v1

- Accounts, saved areas, and change alerting (deferred; see roadmap).
- User-uploaded imagery.
- Sub-10 m resolution sources or commercial imagery.
- Causal claims about *why* something changed.

### Why no login

Citeline gates its demo behind GitHub OAuth, which costs most visitors' interest
before they see anything. EarthDiff's entire value is visible in one click, so
authentication would be a net negative. Rate limiting replaces it as the abuse
control.

## 3. Data source (verified)

Sentinel-2 Level 2A surface reflectance, via the Element 84 Earth Search STAC API
over the AWS Open Data mirror.

Verified on 2026-09-21:

- `POST https://earth-search.aws.element84.com/v1/search` needs **no account and
  no API key**, and supports `bbox`, `datetime`, and `eo:cloud_cover` filters.
- Assets are Cloud-Optimised GeoTIFFs on `sentinel-cogs.s3.us-west-2.amazonaws.com`.
- A single band file is **163 MB** (`Content-Length: 163469108`), and the bucket
  serves `Accept-Ranges: bytes` — a 64 KB range request returned **HTTP 206**.
  Windowed reads are therefore mandatory and available.
- Available assets include `red`, `green`, `blue`, `nir`, `swir16`, `swir22`,
  `scl`, `visual`, and `thumbnail`.
- Scenes are 10980 × 10980 in a UTM projection (e.g. EPSG:32720).
- Ground sample distance: 10 m for `red`/`green`/`blue`/`nir`, 20 m for
  `swir16`/`swir22` and `scl`.

Two consequences shape the implementation. The `visual` asset is a ready-made
true-colour composite, so the before/after display costs no band maths. And
mixing 10 m and 20 m bands requires resampling onto a common grid.

Revisit interval is roughly five days per location, which is why the UI takes
date *windows* rather than exact dates.

## 4. Architecture

A single Next.js 16 application on Vercel. No second service.

The imagery pipeline runs in TypeScript in a route handler:

- `geotiff.js` for windowed COG reads over HTTP range requests.
- `proj4js` for reprojecting the request box into the scene's UTM zone.
- Typed-array maths for indices, differencing, robust thresholds, morphology,
  and connected components.
- `sharp` for PNG encoding of overlays and social preview images.

### Why not a Python service

The original design put rasterio and FastAPI on a free Hugging Face Space.
Hugging Face now requires a PRO plan for Docker Spaces, which breaks the
free-tier constraint. Cloud Run or Render would work, but each adds an account,
a deployment, a cold start, and a network hop to save roughly three hundred
lines of array code. The JavaScript GeoTIFF ecosystem supports the specific
capability that matters here — reading a window out of a remote COG — so the
single-runtime design wins on cost, latency, and operational simplicity.

If the pipeline later outgrows Vercel's function limits, the escape hatch is a
container on Cloud Run's always-free tier, with the route handler becoming a
thin proxy.

### Supporting services (all already provisioned for Citeline)

- **Neon Postgres** — cached analyses, presets, evaluation ground truth, and
  rendered PNGs as `bytea`. Caching is what makes presets instant.
- **Upstash Redis** — per-IP rate limiting on new analyses, plus a hot cache.
- **Gemini** — narrative generation only, constrained to computed facts.
- **Vercel** — hosting, CDN caching of rendered images, OG image generation.

### Request flow

1. Client submits area plus two date windows.
2. Server hashes the request. A cache hit returns the stored analysis
   immediately; presets and permalinks always hit cache.
3. On a miss, rate limit is checked, an `analyses` row is created as `pending`,
   and the pipeline runs with progress written to the row.
4. Client polls until `complete` or `failed`, then renders.

Analyses are expected to take tens of seconds on a cold area, so progress
reporting is part of the contract rather than an afterthought.

## 5. Detection algorithm

### 5.1 Scene selection

Scene-wide cloud cover is the wrong filter: a scene can be 40% cloudy overall
and clear over the requested box. So for each date window:

1. STAC search by box and window, ordered by scene cloud cover.
2. For the top candidates, read only the small `scl` window and compute cloud
   fraction **inside the requested box**.
3. Select the pass with the lowest local cloud fraction.

If the two selected passes fall in materially different seasons, the response
carries a warning, because phenology is the dominant false-positive source.

### 5.2 Reading

Reproject the box from WGS84 into the scene CRS, convert to a pixel window, and
read that window only, for `visual`, `red`, `nir`, `green`, `swir16`, `scl`.
Resample 20 m bands to the 10 m grid — bilinear for continuous bands, nearest
neighbour for `scl`, since interpolating class codes is meaningless.

Read the appropriate COG overview level when the requested area is large, so
output resolution stays bounded regardless of box size.

### 5.3 Masking

Build a validity mask of pixels usable in **both** dates, excluding the `scl`
classes for cloud medium/high probability, thin cirrus, cloud shadow, snow,
saturated/defective, and no-data.

If valid overlap falls below 60% of the box, the analysis **refuses** and asks
the user to widen the date window. Reporting change over mostly-masked pixels
would be dishonest.

### 5.4 Indices

Computed per date over valid pixels:

- **NDVI** = (NIR − Red) / (NIR + Red) — vegetation vigour.
- **NDWI** = (Green − NIR) / (Green + NIR) — surface water.
- **NDBI** = (SWIR16 − NIR) / (SWIR16 + NIR) — built-up and bare ground.

### 5.5 Robust thresholding

Fixed thresholds are brittle, because two passes differ in sun angle and
atmospheric state even when the ground is identical.

For each difference image, compute the median and the median absolute deviation
over valid pixels, then flag pixels beyond `k · MAD` from the median, with
`k ≈ 3`.

Subtracting the median cancels the global offset between passes. Scaling by MAD
adapts the sensitivity per scene instead of relying on constants tuned to one
test case. Both are resistant to the outliers that are the actual signal.

### 5.6 Cleanup and segmentation

1. Morphological opening to remove single-pixel speckle.
2. Connected-component labelling over the flagged mask.
3. Discard regions below a minimum area, so noise is never reported as change.

### 5.7 Classification

Per region, by dominant index movement:

| ΔNDVI | ΔNDWI | ΔNDBI | Class |
| --- | --- | --- | --- |
| strongly down | — | up | Vegetation cleared to bare or built |
| strongly down | up | — | Vegetation flooded |
| — | up | — | New or refilled water |
| — | down | — | Water receded |
| up | — | — | Vegetation gain or regrowth |

Regions matching no rule are reported as unclassified change rather than forced
into a category.

Area per class is the pixel count times 100 m² at 10 m resolution.

### 5.8 Known failure modes

Documented in the README rather than hidden: cross-season comparison, low
sun-angle shadows, thin cirrus the classifier misses, turbid water confusing
NDWI, and 20 m SWIR limiting built-up precision.

## 6. Grounding rule for the narrative

The model receives a fact table, never raw pixels as primary input: hectares per
class, share of analysed area, index deltas, region count, size and location of
the largest region, both acquisition dates, valid coverage, and the place name.

After generation, every numeric claim is extracted and checked against that
table. A number with no matching fact means the output is rejected, one
regeneration is attempted, and on a second failure the app falls back to a
deterministic template summary.

**EarthDiff therefore cannot display a figure that did not come from the
pixels** — the same structural guarantee as Citeline's citation validation.

A second constraint is domain-specific: satellite data shows *what* changed,
never *why*. The prompt forbids causal certainty, so output reads "consistent
with selective logging" rather than asserting it.

## 7. Data model

- **`analyses`** — slug, bbox, requested date windows, selected scene ids,
  status and progress, per-class statistics (JSON), narrative, warnings,
  rendered PNGs, request hash, timestamps.
- **`presets`** — title, description, bbox, date windows, and a public source
  link documenting that the event was real.
- **`eval_cases`** — ground truth for the accuracy harness: expected dominant
  class for positive cases, expected near-zero change for controls, plus
  reference links.
- **`scene_cache`** — STAC lookups keyed by box and window, so popular areas do
  not re-query.

No users table in v1.

## 8. API surface

- `POST /api/analyses` — create or return cached; returns slug and status.
- `GET /api/analyses/:slug` — status, progress, and results when complete.
- `GET /api/analyses/:slug/image/:kind` — before, after, or overlay PNG, served
  with long-lived cache headers.
- `GET /api/presets` — curated examples.
- `GET /api/geocode?q=` — place-name lookup for the search box.

## 9. Accuracy harness

- **Positive cases**: documented events with a known dominant change type, each
  with a public source.
- **Negative controls**: areas where nothing changed — mature forest interior,
  desert, established city centre — compared within the same season.

Reported metrics:

1. Detection rate on positives (did the dominant class match).
2. False-positive area on controls, in hectares.
3. Correct refusal rate on deliberately cloud-blocked requests.

Plus a **seasonal ablation**: the same areas compared within-season versus
across-season, quantifying how much seasonal mismatch inflates false positives.

## 10. Deployment, cost, and limits

Vercel Hobby, Neon free, Upstash free, Gemini free tier. Total cost zero, and no
new accounts beyond those already provisioned for Citeline.

Constraints designed around:

- 10 m resolution — fields, roads, buildings, floods and clearings are visible;
  individual vehicles are not. Stated plainly in the UI.
- Cloud cover — mitigated by date windows and local cloud scoring, and by
  refusing rather than guessing when coverage is insufficient.
- ~5 day revisit — recent dates may have no pass yet.
- Vercel function duration — bounded by reading overview levels for large boxes
  and capping output resolution.

## 11. Attribution and compliance

Copernicus Sentinel data requires attribution: "Contains modified Copernicus
Sentinel data." Displayed in the footer and on every generated share image.

Per-IP rate limiting on new analyses, since each one costs real compute. Presets
and cached permalinks are exempt, so sharing a result never consumes quota.

## 12. Interface, theme, and motion

The project was chosen for visual impact, so presentation is a functional
requirement rather than polish applied at the end.

### 12.1 Theme

Dark-first, because satellite imagery reads best against a dark surround and the
subject matter is the night side of a planet. The base is a near-black with a
faint blue cast rather than pure black, which avoids the dead flatness of
`#000` and gives raised surfaces somewhere to go.

Elegance here means restraint: hairline borders instead of heavy shadows,
generous whitespace on an 8 px rhythm, small radii, and a single accent gradient
used sparingly for active and progress states. A very subtle grain overlay keeps
large dark areas from banding.

Typography pairs a refined sans for the interface with a monospace for numbers
and coordinates. All statistics use **tabular numerals**, so counting animations
do not cause digits to jitter.

Change classes carry semantic colours that must stay distinguishable over
arbitrary imagery and for colour-blind viewers, so each overlay region is drawn
with a contrasting outline rather than relying on fill hue alone:

| Class | Hue |
| --- | --- |
| Vegetation cleared | amber |
| Vegetation gain | green |
| New or refilled water | blue |
| Water receded | sand |
| Bare or built surface | violet |

Text placed over imagery always sits on a scrim to hold contrast at AA.

### 12.2 Motion principles

Animation is purposeful: it either explains state, preserves continuity between
views, or rewards a completed action. Nothing moves for decoration.

- **Durations** — 120–180 ms for micro-interactions, 240–320 ms for panels and
  cards, 500–700 ms for expressive reveals. Nothing exceeds 800 ms.
- **Easing** — decelerating curves for entrances, springs for anything the user
  drags, linear reserved for continuous loops only.
- **Compositor-only** — transform and opacity exclusively. No animated layout
  properties, because the map and canvas need the frame budget.

### 12.3 Signature moments

1. **Hero** — slow continuous parallax on an orbital image with a staggered
   text reveal, establishing the subject before a word is read.
2. **Preset cards** — hovering crossfades between the before and after images,
   teasing the core interaction before the visitor clicks anything.
3. **Staged progress** — an analysis takes tens of seconds, so rather than a
   spinner the pipeline narrates itself: finding clear passes, reading bands,
   masking cloud, computing indices, detecting change. Each stage animates in as
   it begins. This converts dead waiting time into an explanation of how the
   thing works, which is also the most persuasive part of the demo.
4. **Result reveal** — the change overlay wipes in, region outlines draw
   themselves, and the hectare figures count up.
5. **Swipe comparison** — a spring-damped drag handle with a soft glow.
6. **Shared-element transition** — a preset card's image expands into the full
   result view rather than cutting to a new page.

### 12.4 Reduced motion

`prefers-reduced-motion` is honoured throughout, and not as an afterthought:
parallax and autoplaying crossfades are disabled, transitions collapse to
opacity or become instant, and the counting statistics render their final values
immediately. The interface must be fully usable and still feel considered with
all motion switched off.

### 12.5 Implementation

`motion` for React animation, including layout and shared-element transitions.
MapLibre GL for the map on a keyless basemap. Tailwind 4 for styling, with the
palette, type scale, easing curves, and durations defined once as design tokens
so values are never hardcoded per component.

## 13. Roadmap

- Saved areas with change alerting, using durable scheduled jobs.
- Timeline mode: many dates in sequence rather than a pair.
- Additional indices — burn severity for wildfire, snow cover.
- Sentinel-1 radar, which sees through cloud, as a fallback for permanently
  cloudy regions.
- Embeddable widget for a single monitored area.
