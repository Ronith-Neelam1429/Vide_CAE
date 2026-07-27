import type { MechContactResult } from "./mechanics";
import type { HeatContactResult, NerveActivationResult, ResultSummary } from "./simulation";
import { injuryRiskFromOmega, timeToPeakBasalS } from "./verdict";
import { mechRiskFromSummary, recoveryRatio } from "./mechVerdict";

export type SafetyBudget = {
  usedPercent: number;
  displayPercent: number;
  label: string;
};

export function safetyBudget(usedPercent: number, label: string): SafetyBudget {
  const finite = Number.isFinite(usedPercent) ? Math.max(0, usedPercent) : 0;
  return {
    usedPercent: finite,
    displayPercent: Math.min(100, finite),
    label,
  };
}

export function heatSafetyBudget(summary: ResultSummary): SafetyBudget {
  return safetyBudget(summary.omegaBasal * 100, "Henriques injury threshold");
}

export function electricalSafetyBudget(
  activation: NerveActivationResult,
): SafetyBudget {
  // activationMargin is applied current / threshold current.
  return safetyBudget(activation.activationMargin * 100, "Nerve activation threshold");
}

export function mechanicalSafetyBudget(contact: MechContactResult): SafetyBudget {
  if (contact.fatigue) {
    return safetyBudget(contact.fatigue.damageFraction * 100, "Predicted fatigue life");
  }
  return safetyBudget(
    (contact.pressureInjury?.thresholdRatio ?? 0) * 100,
    "Pressure-time screening threshold",
  );
}

export function heatTemperatureMargin(summary: ResultSummary, thresholdC = 44) {
  const marginC = thresholdC - summary.peakBasalTemperatureC;
  return {
    marginC,
    marginPercent: (marginC / thresholdC) * 100,
  };
}

export function heatComparisonAnchor(peakSurfaceC: number): string {
  const anchors = [
    { value: 41.5, label: "very warm bathwater" },
    { value: 45, label: "the typical heat-pain onset" },
    { value: 55, label: "a hot pan handle" },
  ];
  return anchors.reduce((nearest, anchor) =>
    Math.abs(anchor.value - peakSurfaceC) < Math.abs(nearest.value - peakSurfaceC)
      ? anchor
      : nearest,
  ).label;
}

export function heatSynthesis(contact: HeatContactResult): string {
  const { summary } = contact;
  const { level } = injuryRiskFromOmega(summary.omegaBasal, summary.omegaDermalBase);
  const { marginC } = heatTemperatureMargin(summary);
  const peakTime = timeToPeakBasalS(contact.series);
  const time = peakTime === null ? "" : ` at ${peakTime.toFixed(1)} s`;

  if (marginC > 0) {
    return `${level} injury risk. Peak basal temperature stayed ${marginC.toFixed(1)} °C below 44 °C${time}.`;
  }
  return `${level} injury risk. Peak basal temperature exceeded 44 °C by ${Math.abs(marginC).toFixed(1)} °C${time}.`;
}

export function electricalSynthesis(activation: NerveActivationResult): string {
  const margin = activation.activationMargin;
  if (margin < 1) {
    const factor = margin > 0 ? 1 / margin : Infinity;
    const factorLabel = Number.isFinite(factor) ? `${factor.toFixed(1)}×` : "well";
    return `${activation.classification}. Applied current is ${factorLabel} below the modeled threshold at ${activation.pulseDurationUs.toFixed(0)} µs.`;
  }
  return `${activation.classification}. Applied current is ${margin.toFixed(1)}× the modeled threshold at ${activation.pulseDurationUs.toFixed(0)} µs.`;
}

export function mechanicalSynthesis(contact: MechContactResult): string {
  const { level } = mechRiskFromSummary(contact.summary, contact.fatigue);
  if (contact.fatigue) {
    const fatigue = contact.fatigue;
    return `${level}. ${fatigue.cyclesApplied.toLocaleString()} applied cycles use ${(fatigue.damageFraction * 100).toFixed(1)}% of predicted fatigue life.`;
  }
  if (contact.pressureInjury) {
    return `${level}. Applied pressure is ${(contact.pressureInjury.thresholdRatio * 100).toFixed(0)}% of the pressure-time screening threshold at ${(contact.pressureInjury.durationMinutes / 60).toFixed(2)} h.`;
  }
  return `${level}. ${(recoveryRatio(contact.summary) * 100).toFixed(0)}% of peak indentation recovered after release.`;
}
