import { useMemo } from "react";

export type PhaseSample = {
  timeS: number;
  phase: string;
};

export type PhaseStripSegment = {
  phase: string;
  startS: number;
  endS: number;
};

const PHASE_STYLE: Record<string, { color: string; label: string }> = {
  baseline: { color: "#3a3a3a", label: "Baseline" },
  exposure: { color: "#0696d7", label: "Contact" },
  cooling: { color: "#3f4a3a", label: "Cooling" },
  hold: { color: "#0696d7", label: "Hold" },
  ramp: { color: "#e3b341", label: "Ramp" },
  release: { color: "#3f4a3a", label: "Release" },
  loading: { color: "#0696d7", label: "Load" },
  recovery: { color: "#3f4a3a", label: "Recovery" },
  "cyclic-loading": { color: "#0696d7", label: "Load" },
  "cyclic-recovery": { color: "#3f4a3a", label: "Recovery" },
  "cyclic-release": { color: "#3f4a3a", label: "Release" },
};

function phaseStyle(phase: string) {
  return PHASE_STYLE[phase] ?? { color: "#404040", label: phase };
}

/** Collapse consecutive same-phase samples into contiguous time ranges. */
export function buildPhaseSegments(samples: PhaseSample[]): PhaseStripSegment[] {
  if (samples.length === 0) return [];

  const segments: PhaseStripSegment[] = [];
  let current = samples[0]!;
  let startS = current.timeS;

  for (let i = 1; i < samples.length; i += 1) {
    const sample = samples[i]!;
    if (sample.phase !== current.phase) {
      segments.push({
        phase: current.phase,
        startS,
        endS: sample.timeS,
      });
      current = sample;
      startS = sample.timeS;
    }
  }

  const last = samples[samples.length - 1]!;
  segments.push({
    phase: current.phase,
    startS,
    endS: Math.max(last.timeS, startS),
  });

  return segments;
}

type PhaseStripProps = {
  samples: PhaseSample[];
  /** Match Recharts plot inset so phase edges align with the chart above. */
  insetLeftPx?: number;
  insetRightPx?: number;
};

export function PhaseStrip({
  samples,
  insetLeftPx = 38,
  insetRightPx = 10,
}: PhaseStripProps) {
  const segments = useMemo(() => buildPhaseSegments(samples), [samples]);
  const durationS = useMemo(() => {
    if (samples.length === 0) return 0;
    return Math.max(samples[samples.length - 1]!.timeS, 0);
  }, [samples]);

  if (segments.length === 0 || durationS <= 0) return null;

  const legend = Array.from(
    new Map(segments.map((segment) => [segment.phase, phaseStyle(segment.phase)])).entries(),
  );

  return (
    <div className="phase-strip" aria-label="Simulation phases">
      <div
        className="phase-strip__track"
        style={{ paddingLeft: insetLeftPx, paddingRight: insetRightPx }}
      >
        <div className="phase-strip__bar">
          {segments.map((segment, index) => {
            const widthPct = ((segment.endS - segment.startS) / durationS) * 100;
            if (widthPct <= 0) return null;
            const style = phaseStyle(segment.phase);
            return (
              <span
                key={`${segment.phase}-${segment.startS}-${index}`}
                className="phase-strip__segment"
                style={{ width: `${widthPct}%`, background: style.color }}
                title={`${style.label}: ${segment.startS.toFixed(2)}–${segment.endS.toFixed(2)} s`}
              />
            );
          })}
        </div>
      </div>
      <div className="phase-strip__legend">
        {legend.map(([phase, style]) => (
          <span key={phase}>
            <i style={{ background: style.color }} />
            {style.label}
          </span>
        ))}
      </div>
    </div>
  );
}
