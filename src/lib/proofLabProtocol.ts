import type { ExperimentMetric } from "./simulation";

export type ProtocolMatchKey =
  | "temperatureC"
  | "durationS"
  | "contactAreaMm2"
  | "baselineSkinTemperatureC";

export type ProtocolMismatch = {
  key: ProtocolMatchKey;
  label: string;
  paper: number;
  yours: number;
};

export type ProtocolMatchResult = {
  matched: boolean;
  mismatches: ProtocolMismatch[];
};

const PROTOCOL_KEYS: Array<{ key: ProtocolMatchKey; label: string }> = [
  { key: "temperatureC", label: "Heater setpoint" },
  { key: "durationS", label: "Heating duration" },
  { key: "contactAreaMm2", label: "Contact area" },
  { key: "baselineSkinTemperatureC", label: "Baseline skin temperature" },
];

function withinTolerance(key: ProtocolMatchKey, paper: number, yours: number): boolean {
  const delta = Math.abs(yours - paper);
  switch (key) {
    case "temperatureC":
    case "baselineSkinTemperatureC":
      return delta <= 0.5;
    case "durationS":
      return delta <= Math.max(2, paper * 0.05);
    case "contactAreaMm2":
      return delta <= Math.max(1, paper * 0.05);
    default:
      return delta <= 1e-6;
  }
}

export function computeProtocolMatch(
  paper: Record<string, number>,
  yours: Record<string, number>,
): ProtocolMatchResult {
  const mismatches: ProtocolMismatch[] = [];

  for (const { key, label } of PROTOCOL_KEYS) {
    const paperValue = paper[key];
    const yoursValue = yours[key];
    if (paperValue === undefined || yoursValue === undefined) continue;
    if (!withinTolerance(key, paperValue, yoursValue)) {
      mismatches.push({ key, label, paper: paperValue, yours: yoursValue });
    }
  }

  return { matched: mismatches.length === 0, mismatches };
}

export function formatProofLabTemp(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(1)} °C`;
}

export function formatProofLabPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export function formatProofLabNumber(
  value: number | null | undefined,
  digits = 1,
  unit = "",
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits)}${unit}`;
}

export function formatProofLabSigned(
  value: number | null | undefined,
  digits = 1,
  unit = "",
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}${unit}`;
}

export function formatDurationS(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return "—";
  if (seconds >= 120) return `${(seconds / 60).toFixed(1)} min`;
  return `${seconds.toFixed(1)} s`;
}

export function protocolMismatchSentence(mismatches: ProtocolMismatch[]): string {
  if (mismatches.length === 0) {
    return "Your sidebar matches the published protocol — error metrics below reflect model accuracy.";
  }
  const parts = mismatches.map((item) => {
    if (item.key === "temperatureC") {
      return `${item.label.toLowerCase()} (${formatProofLabTemp(item.yours)} vs study ${formatProofLabTemp(item.paper)})`;
    }
    if (item.key === "durationS") {
      return `${item.label.toLowerCase()} (${formatDurationS(item.yours)} vs study ${formatDurationS(item.paper)})`;
    }
    if (item.key === "contactAreaMm2") {
      return `${item.label.toLowerCase()} (${formatProofLabNumber(item.yours, 1, " mm²")} vs study ${formatProofLabNumber(item.paper, 1, " mm²")})`;
    }
    return `${item.label.toLowerCase()} (${formatProofLabTemp(item.yours)} vs study ${formatProofLabTemp(item.paper)})`;
  });
  return `Your sidebar differs from the study on ${parts.join(", ")} — you are comparing different experiments, not testing model accuracy yet.`;
}

export function accuracyVerdictSentence(
  rmseC: number | null | undefined,
  maeC: number | null | undefined,
): string {
  const rmse = rmseC ?? maeC;
  if (rmse === null || rmse === undefined || Number.isNaN(rmse)) {
    return "Protocol matched — review checkpoint tables for fit quality.";
  }
  if (rmse <= 1) {
    return `Model tracks published data within ${formatProofLabNumber(rmse, 1, " °C")} typical gap.`;
  }
  if (rmse <= 3) {
    return `Model is in the right range but shows a ${formatProofLabNumber(rmse, 1, " °C")} typical gap — inspect checkpoints for where drift appears.`;
  }
  return `Model diverges from published checkpoints by ${formatProofLabNumber(rmse, 1, " °C")} typical gap — worth investigating physics or measurement alignment.`;
}

export function accuracyTone(
  rmseC: number | null | undefined,
): "close" | "mixed" | "divergent" {
  const rmse = rmseC ?? 0;
  if (rmse <= 1) return "close";
  if (rmse <= 3) return "mixed";
  return "divergent";
}

export function isSingleValueMetric(metric: ExperimentMetric): boolean {
  if (metric.category === "summary") return true;
  if (metric.id === "sample_count") return true;
  return metric.paperValue === null && metric.videValue !== null;
}

export function windowMetricsForDisplay(windowMetrics: ExperimentMetric[]): ExperimentMetric[] {
  return windowMetrics.filter((metric) => metric.category !== "parameter");
}
