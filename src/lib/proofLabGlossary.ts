/** Plain-language help for Proof Lab metrics and columns. */

export const PROOF_LAB_COLUMN_HELP = {
  published:
    "What the study actually measured and reported — ground truth from the paper’s dataset.",
  yours: "What Vide predicted using your current sidebar contact settings.",
  delta: "Your simulation minus the published value. Positive means you ran hotter / higher.",
  relative: "Percent difference relative to the published value.",
} as const;

export const PROOF_LAB_CATEGORY_HELP: Record<string, string> = {
  checkpoint: "A specific time or condition reported in the study.",
  derived: "Calculated from published and simulated checkpoints (e.g. warming rate).",
  summary: "Overall fit score across all aligned samples in the window.",
  parameter: "Protocol setting — yours vs what the paper used.",
};

export const PROOF_LAB_METRIC_HELP: Record<string, string> = {
  baseline_temperature:
    "Temperature at the first published time in this window — usually pre-heat or session start.",
  end_temperature:
    "Temperature at the last published checkpoint in this window (e.g. right after heater removal).",
  temperature_rise:
    "How much the skin warmed from the first to the last checkpoint (ΔT).",
  mean_rise_rate:
    "Average warming speed across the window, in degrees per minute.",
  peak_temperature:
    "Highest temperature recorded in the window — study peak vs your simulated peak.",
  peak_temperature_error:
    "Difference between your simulated peak temperature and the study's peak.",
  sample_count: "How many published time points were aligned and compared in this window.",
  rmse:
    "Root mean square error: typical gap at every aligned time point. Lower = closer overall fit.",
  mae:
    "Mean absolute error: average size of mismatch, ignoring whether you run hot or cool.",
  signed_bias:
    "Average direction of error. Positive = your simulation runs hotter than the study.",
  time_to_peak_error:
    "Seconds your peak occurs after (+) or before (−) the study’s peak.",
  user_setpoint:
    "Heater / probe target temperature from your sidebar contact.",
  paper_setpoint:
    "Target temperature the published study actually used.",
  user_duration:
    "How long your sidebar contact applies heat.",
  paper_duration:
    "Heating duration in the published protocol.",
  rheobase:
    "Minimum current needed for a very long pulse to be felt (strength–duration curve).",
  chronaxie:
    "Pulse duration at twice rheobase — characterizes nerve excitability.",
  threshold:
    "Perception or injury threshold at a given pulse duration or load time.",
};

export function metricDescription(metric: {
  id: string;
  description?: string | null;
  note?: string | null;
}): string {
  return (
    metric.description ??
    PROOF_LAB_METRIC_HELP[metric.id] ??
    metric.note ??
    ""
  );
}

export function formatParamKey(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}
