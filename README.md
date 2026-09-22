# EarthDiff

**git diff for the planet.** Pick an area and two date windows — EarthDiff finds the clearest Sentinel-2 passes, detects what changed on the ground, and reports hectares by change type with a before/after view. Numbers come from the pixels; the narrative is checked against those facts.

Built on free public data (Copernicus Sentinel-2 via [Earth Search](https://www.element84.com/earth-search/)). No API key for imagery.

## Status

Early development. The **detection core** is implemented and verified on real scenes (Rondônia deforestation frontier):

- STAC scene search
- Windowed Cloud-Optimised GeoTIFF reads from Node (`geotiff`)
- NDVI / NDWI / NDBI, cloud masking, robust differencing, morphology, region labelling

Run the verification spike (writes PNGs to `tmp/`):

```bash
npm run spike:render
```

Design and architecture: [docs/design.md](docs/design.md).

## Stack

Next.js 16, TypeScript, Tailwind 4, MapLibre GL (UI in progress), Neon + Upstash + Gemini (planned for cache, rate limits, and grounded summaries).

## Develop

```bash
npm install
npm run dev    # http://localhost:3004
npm run typecheck
npm run spike:cog      # single-band COG window read
npm run spike:perf     # parallel read timing
npm run spike:render   # full pipeline + PNGs
```

## Attribution

Contains modified Copernicus Sentinel data.

## License

MIT — see [LICENSE](LICENSE).
