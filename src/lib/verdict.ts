import type { HeatContactResult, ResultSummary, ThermalSample } from "./simulation";

export type InjuryRiskLevel =
  | "None"
  | "Low"
  | "Moderate"
  | "High"
  | "Threshold exceeded";

export type InjuryRiskTone = "none" | "low" | "moderate" | "high" | "exceeded";

export function injuryRiskFromOmega(omegaBasal: number, omegaDermalBase: number): {
  level: InjuryRiskLevel;
  tone: InjuryRiskTone;
} {
  const omega = Math.max(omegaBasal, omegaDermalBase);
  if (omega >= 1) return { level: "Threshold exceeded", tone: "exceeded" };
  if (omega >= 0.53) return { level: "High", tone: "high" };
  if (omega >= 0.1) return { level: "Moderate", tone: "moderate" };
  if (omega > 0) return { level: "Low", tone: "low" };
  return { level: "None", tone: "none" };
}

export function timeToPeakBasalS(series: ThermalSample[]): number | null {
  if (series.length === 0) return null;
  let best = series[0]!;
  for (const sample of series) {
    if (sample.basalTemperatureC > best.basalTemperatureC) best = sample;
  }
  return best.timeS;
}

/** Plain-English headline from already-computed numbers. */
export function verdictSentence(
  summary: ResultSummary,
  peakBasalTimeS: number | null,
  thresholdC = 44,
): string {
  const peak = summary.peakBasalTemperatureC;
  const omega = summary.omegaBasal;
  const at = peakBasalTimeS === null ? "" : ` at ${peakBasalTimeS.toFixed(1)}s`;
  const below = peak < thresholdC;

  if (omega >= 1) {
    return `Peak basal-layer temperature reached ${peak.toFixed(1)}°C${at} — damage integral Ω = ${omega.toFixed(2)} of 1.0 (Henriques irreversible-injury threshold exceeded).`;
  }

  if (below) {
    return `Peak basal-layer temperature reached ${peak.toFixed(1)}°C${at} — below the ${thresholdC}°C injury threshold. ${
      omega <= 0
        ? "No measurable tissue damage (Ω = 0.00 of 1.0)."
        : `Measurable but sub-threshold damage (Ω = ${omega.toFixed(2)} of 1.0).`
    }`;
  }

  return `Peak basal-layer temperature reached ${peak.toFixed(1)}°C${at} — at or above the ${thresholdC}°C temperature threshold. Damage integral Ω = ${omega.toFixed(2)} of 1.0 (threshold for irreversible injury).`;
}

export function skinSiteLabel(contact: HeatContactResult): string {
  return contact.skinProfile.label;
}
