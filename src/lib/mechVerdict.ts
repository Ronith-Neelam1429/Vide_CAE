import type { FatigueResult, MechContactResult, MechSummary } from "./mechanics";

export type MechRiskLevel =
  | "Reversible"
  | "Elevated"
  | "Permanent set"
  | "Fatigue critical";

export type MechRiskTone = "none" | "moderate" | "high" | "exceeded";

export function mechRiskFromSummary(
  summary: MechSummary,
  fatigue: FatigueResult | null,
): { level: MechRiskLevel; tone: MechRiskTone } {
  if (
    summary.verdict.toLowerCase().includes("fatigue fracture") ||
    (fatigue && fatigue.damageFraction >= 1)
  ) {
    return { level: "Fatigue critical", tone: "exceeded" };
  }
  if (
    summary.verdict.toLowerCase().includes("permanent") ||
    summary.verdict.toLowerCase().includes("yield")
  ) {
    return { level: "Permanent set", tone: "high" };
  }
  if (
    summary.verdict.toLowerCase().includes("large") ||
    summary.deformationPercent >= 3
  ) {
    return { level: "Elevated", tone: "moderate" };
  }
  return { level: "Reversible", tone: "none" };
}

export function timeToPeakIndentationS(
  series: MechContactResult["indentationSeries"],
): number | null {
  if (series.length === 0) return null;
  let best = series[0]!;
  for (const sample of series) {
    if (sample.indentationUm > best.indentationUm) best = sample;
  }
  return best.timeS;
}

export function recoveryRatio(summary: MechSummary): number {
  if (summary.peakIndentationUm <= 0) return 1;
  return Math.max(
    0,
    (summary.peakIndentationUm - summary.residualIndentationUm) /
      summary.peakIndentationUm,
  );
}

export function formatStressKpa(kpa: number): string {
  if (kpa >= 1000) return `${(kpa / 1000).toFixed(2)} MPa`;
  return `${kpa.toFixed(1)} kPa`;
}

export function mechVerdictSentence(contact: MechContactResult): string {
  const { summary, fatigue, inputs } = contact;
  const peak = summary.peakIndentationUm;
  const residual = summary.residualIndentationUm;
  const peakTime = timeToPeakIndentationS(contact.indentationSeries);
  const at = peakTime === null ? "" : ` at ${peakTime.toFixed(1)} s`;
  const recovery = recoveryRatio(summary);

  if (fatigue && fatigue.damageFraction >= 1) {
    return `Peak indentation ${peak.toFixed(0)} µm${at} under ${inputs.appliedPressureKpa.toFixed(0)} kPa. Fatigue damage reached 100% of predicted cortical-bone life (${fatigue.cyclesApplied.toFixed(0)} of ${fatigue.cyclesToFailure.toFixed(0)} cycles) — fracture threshold exceeded.`;
  }

  if (fatigue && fatigue.damageFraction > 0) {
    return `Peak indentation ${peak.toFixed(0)} µm${at} — ${summary.deformationPercent.toFixed(1)}% column compression. Fatigue consumed ${(fatigue.damageFraction * 100).toFixed(1)}% of predicted bone life (${formatStressKpa(fatigue.stressAmplitudeMpa * 1000)} amplitude).`;
  }

  if (summary.verdict.toLowerCase().includes("permanent") || residual > 0.5) {
    return `Peak indentation ${peak.toFixed(0)} µm${at} — ${residual.toFixed(1)} µm permanent set remains (${((1 - recovery) * 100).toFixed(0)}% of peak not recovered). At least one tissue layer exceeded its yield strain.`;
  }

  if (summary.verdict.toLowerCase().includes("large")) {
    return `Peak indentation ${peak.toFixed(0)} µm${at} (${summary.deformationPercent.toFixed(1)}% of modeled tissue column) — large but elastically reversible; ${(recovery * 100).toFixed(0)}% recovery after release.`;
  }

  return `Peak indentation ${peak.toFixed(0)} µm${at} under ${inputs.appliedPressureKpa.toFixed(0)} kPa — ${summary.deformationPercent.toFixed(1)}% column compression, fully reversible (${(recovery * 100).toFixed(0)}% recovery).`;
}
