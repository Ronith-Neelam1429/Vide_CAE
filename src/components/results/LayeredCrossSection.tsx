import { useMemo } from "react";

export type LayerBand = {
  layerName: string;
  depthStartMm: number;
  depthEndMm: number;
  value: number;
};

export type ColorScaleConfig = {
  min: number;
  max: number;
  /** Hex color stops from low → high. */
  stops: string[];
};

type LayeredCrossSectionProps = {
  bands: LayerBand[];
  colorScale: ColorScaleConfig;
  unit: string;
  title?: string;
  valueFormatter?: (value: number) => string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parseHex(hex: string): [number, number, number] {
  const raw = hex.replace("#", "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((ch) => `${ch}${ch}`)
          .join("")
      : raw;
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]) {
  return `#${[r, g, b]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

function lerpHex(a: string, b: string, t: number) {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  return toHex([
    Math.round(ar + (br - ar) * t),
    Math.round(ag + (bg - ag) * t),
    Math.round(ab + (bb - ab) * t),
  ]);
}

export function colorForValue(value: number, scale: ColorScaleConfig): string {
  const { min, max, stops } = scale;
  if (stops.length === 0) return "#404040";
  if (stops.length === 1 || max <= min) return stops[0]!;
  const t = clamp((value - min) / (max - min), 0, 1);
  const scaled = t * (stops.length - 1);
  const index = Math.floor(scaled);
  const frac = scaled - index;
  if (index >= stops.length - 1) return stops[stops.length - 1]!;
  return lerpHex(stops[index]!, stops[index + 1]!, frac);
}

const defaultFormatter = (value: number) =>
  Math.abs(value) >= 100 || (Math.abs(value) > 0 && Math.abs(value) < 0.01)
    ? value.toPrecision(3)
    : value.toFixed(2);

export function LayeredCrossSection({
  bands,
  colorScale,
  unit,
  title = "Tissue cross-section",
  valueFormatter = defaultFormatter,
}: LayeredCrossSectionProps) {
  const totalDepthMm = useMemo(() => {
    if (bands.length === 0) return 0;
    return Math.max(...bands.map((band) => band.depthEndMm));
  }, [bands]);

  if (bands.length === 0 || totalDepthMm <= 0) return null;

  return (
    <section className="layer-slab" aria-label={title}>
      <div className="result-tier-label">{title}</div>
      <div className="layer-slab__body">
        <div className="layer-slab__stack">
          {bands.map((band) => {
            const thickness = Math.max(0, band.depthEndMm - band.depthStartMm);
            const heightPct = (thickness / totalDepthMm) * 100;
            const color = colorForValue(band.value, colorScale);
            return (
              <div
                key={`${band.layerName}-${band.depthStartMm}`}
                className="layer-slab__band"
                style={{
                  flexGrow: Math.max(thickness, 0.05),
                  flexBasis: 0,
                  minHeight: Math.max(22, heightPct * 0.9),
                  ["--layer-color" as string]: color,
                }}
                title={`${band.layerName}: ${valueFormatter(band.value)} ${unit} · ${band.depthStartMm.toFixed(2)}–${band.depthEndMm.toFixed(2)} mm`}
              >
                <i className="layer-slab__swatch" aria-hidden="true" />
                <span className="layer-slab__name">{band.layerName}</span>
                <strong className="layer-slab__value">
                  {valueFormatter(band.value)}
                  <em> {unit}</em>
                </strong>
                <small className="layer-slab__depth">
                  {band.depthStartMm.toFixed(2)}–{band.depthEndMm.toFixed(2)} mm
                </small>
              </div>
            );
          })}
        </div>
        <div className="layer-slab__scale" aria-hidden="true">
          <span>{valueFormatter(colorScale.max)}</span>
          <div
            className="layer-slab__ramp"
            style={{
              background: `linear-gradient(180deg, ${[...colorScale.stops].reverse().join(", ")})`,
            }}
          />
          <span>{valueFormatter(colorScale.min)}</span>
          <small>{unit}</small>
        </div>
      </div>
      <p className="layer-slab__caption">
        Surface at top · depth increases downward · band height ∝ thickness
      </p>
    </section>
  );
}

/** Collapse consecutive depth-profile samples that share a layer name. */
export function bandsFromDepthProfile(
  samples: Array<{
    depthMm: number;
    layer: string;
    peakTemperatureC: number;
  }>,
): LayerBand[] {
  if (samples.length === 0) return [];

  const bands: LayerBand[] = [];
  let layer = samples[0]!.layer;
  let startMm = samples[0]!.depthMm;
  let prev = samples[0]!;
  let peak = samples[0]!.peakTemperatureC;

  for (let i = 1; i < samples.length; i += 1) {
    const sample = samples[i]!;
    if (sample.layer !== layer) {
      const boundary = (prev.depthMm + sample.depthMm) / 2;
      bands.push({
        layerName: layer,
        depthStartMm: startMm === samples[0]!.depthMm ? 0 : startMm,
        depthEndMm: boundary,
        value: peak,
      });
      startMm = boundary;
      layer = sample.layer;
      peak = sample.peakTemperatureC;
    } else {
      peak = Math.max(peak, sample.peakTemperatureC);
    }
    prev = sample;
  }

  bands.push({
    layerName: layer,
    depthStartMm: bands.length === 0 ? 0 : startMm,
    depthEndMm: Math.max(prev.depthMm, startMm),
    value: peak,
  });

  if (bands[0]) bands[0].depthStartMm = 0;
  return bands;
}
