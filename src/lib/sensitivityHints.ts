import type { SensitivityEntry } from "./simulation";

/** Map stimulus form field keys → sensitivity parameter name matchers. */
const FIELD_MATCHERS: Array<{
  fieldKey: string;
  match: (parameter: string) => boolean;
}> = [
  {
    fieldKey: "contactConductanceWM2K",
    match: (p) => /contact conductance/i.test(p),
  },
  {
    fieldKey: "interfaceThicknessUm",
    match: (p) => /contact conductance/i.test(p),
  },
  {
    fieldKey: "interfaceMaterialId",
    match: (p) => /contact conductance/i.test(p),
  },
  {
    fieldKey: "contactPressureKpa",
    match: (p) => /contact conductance/i.test(p),
  },
  {
    fieldKey: "skinProfileId",
    match: (p) => /thickness/i.test(p),
  },
  {
    fieldKey: "perfusionModel",
    match: (p) => /perfusion/i.test(p),
  },
  {
    fieldKey: "perfusionMaxFold",
    match: (p) => /perfusion/i.test(p),
  },
  {
    fieldKey: "baselineSkinTemperatureC",
    match: () => false,
  },
];

export type FieldImpactHint = {
  spanC: number;
  impact: "high" | "medium" | "low";
  label: string;
};

function impactFromSpan(spanC: number): FieldImpactHint["impact"] {
  if (spanC >= 1) return "high";
  if (spanC >= 0.3) return "medium";
  return "low";
}

/** Best sensitivity match for a form field, if any. */
export function impactHintForField(
  fieldKey: string,
  sensitivity: SensitivityEntry[],
): FieldImpactHint | null {
  if (sensitivity.length === 0) return null;

  const matcher = FIELD_MATCHERS.find((entry) => entry.fieldKey === fieldKey);
  if (!matcher) return null;

  const matches = sensitivity.filter((entry) => matcher.match(entry.parameter));
  if (matches.length === 0) return null;

  const best = matches.reduce((a, b) =>
    a.peakBasalSpanC >= b.peakBasalSpanC ? a : b,
  );

  return {
    spanC: best.peakBasalSpanC,
    impact: impactFromSpan(best.peakBasalSpanC),
    label: `${impactFromSpan(best.peakBasalSpanC)} impact (±${best.peakBasalSpanC.toFixed(2)}°C)`,
  };
}

/** Sort field keys by descending sensitivity impact (unknowns last). */
export function sortFieldsByImpact<T extends { key: string }>(
  fields: T[],
  sensitivity: SensitivityEntry[],
): T[] {
  return [...fields].sort((a, b) => {
    const ha = impactHintForField(a.key, sensitivity)?.spanC ?? -1;
    const hb = impactHintForField(b.key, sensitivity)?.spanC ?? -1;
    return hb - ha;
  });
}
