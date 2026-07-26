import { Color } from "three";

/** Linear interpolation of a numeric field of a time series at time `t` (s). */
export function sampleSeriesAtTime<T extends { timeS: number }>(
  series: T[],
  t: number,
  key: keyof T,
): number | null {
  if (series.length === 0) return null;
  if (t <= series[0].timeS) return series[0][key] as number;
  const last = series[series.length - 1];
  if (t >= last.timeS) return last[key] as number;

  for (let i = 1; i < series.length; i += 1) {
    const b = series[i];
    if (b.timeS >= t) {
      const a = series[i - 1];
      const span = b.timeS - a.timeS;
      const f = span > 1e-9 ? (t - a.timeS) / span : 0;
      const av = a[key] as number;
      const bv = b[key] as number;
      return av + (bv - av) * f;
    }
  }
  return last[key] as number;
}

const SKIN_BASE = new Color("#c99a7c");
const WARM = new Color("#e8a54e");
const HOT = new Color("#e0503a");
const SCALD = new Color("#c81e3a");

/**
 * Map a tissue-surface temperature to a colour on a physiological heat ramp:
 * neutral skin at baseline, warming through amber, to red past the 44 °C burn
 * threshold. Returned as a three.js Color so materials can lerp to it.
 */
export function temperatureColor(tempC: number, baselineC = 33): Color {
  const out = new Color();
  if (tempC <= baselineC) return out.copy(SKIN_BASE);
  if (tempC < 40) {
    return out.copy(SKIN_BASE).lerp(WARM, (tempC - baselineC) / (40 - baselineC));
  }
  if (tempC < 44) {
    return out.copy(WARM).lerp(HOT, (tempC - 40) / 4);
  }
  const f = Math.min(1, (tempC - 44) / 11);
  return out.copy(HOT).lerp(SCALD, f);
}
