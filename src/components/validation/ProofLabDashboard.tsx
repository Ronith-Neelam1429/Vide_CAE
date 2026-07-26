import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ProofLabCaseResult, WindowComparison } from "../../lib/simulation";
import { useExperimentStore } from "../../store/experimentStore";

function formatMetric(value: number | null | undefined, digits = 3, unit = ""): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "Unavailable";
  }
  return `${value.toFixed(digits)}${unit}`;
}

function MetricsTable({ window }: { window: WindowComparison }) {
  const { metrics } = window;
  return (
    <table className="proof-lab__metrics">
      <thead>
        <tr>
          <th>Metric</th>
          <th>Measured</th>
          <th>Predicted</th>
          <th>Error</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Samples</td>
          <td colSpan={3}>{window.sampleCount}</td>
        </tr>
        <tr>
          <td>RMSE</td>
          <td>—</td>
          <td>—</td>
          <td>{formatMetric(metrics.rmseC, 3, " °C")}</td>
        </tr>
        <tr>
          <td>MAE</td>
          <td>—</td>
          <td>—</td>
          <td>{formatMetric(metrics.maeC, 3, " °C")}</td>
        </tr>
        <tr>
          <td>Signed bias</td>
          <td>—</td>
          <td>—</td>
          <td>{formatMetric(metrics.signedBiasC, 3, " °C")}</td>
        </tr>
        <tr>
          <td>Peak temperature</td>
          <td>{formatMetric(window.peakMeasuredC, 2, " °C")}</td>
          <td>{formatMetric(window.peakPredictedC, 2, " °C")}</td>
          <td>{formatMetric(metrics.peakTemperatureErrorC, 2, " °C")}</td>
        </tr>
        <tr>
          <td>Time-to-peak error</td>
          <td colSpan={2}>—</td>
          <td>{formatMetric(metrics.timeToPeakErrorS, 1, " s")}</td>
        </tr>
      </tbody>
    </table>
  );
}

function WindowChart({ entry, window }: { entry: ProofLabCaseResult; window: WindowComparison }) {
  const data = useMemo(() => {
    if (window.comparison.length > 0) {
      return window.comparison.map((point) => ({
        timeS: point.timeS,
        measuredC: point.measuredC,
        predictedC: point.predictedC,
      }));
    }
    const predictedKey =
      entry.measurementTarget === "skin_surface"
        ? "surfaceTemperatureC"
        : "deviceTemperatureC";
    return entry.predictedSeries
      .filter((sample) => sample.timeS >= window.startS && sample.timeS <= window.endS)
      .map((sample) => ({
        timeS: sample.timeS,
        measuredC: null as number | null,
        predictedC:
          predictedKey === "surfaceTemperatureC"
            ? sample.surfaceTemperatureC
            : sample.deviceTemperatureC,
      }));
  }, [entry, window]);

  return (
    <div className="validation-chart" aria-label={`${window.label} overlay`}>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="#3d3d3d" strokeDasharray="3 3" />
          <XAxis
            dataKey="timeS"
            type="number"
            unit=" s"
            tick={{ fill: "#909090", fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: "#4a4a4a" }}
          />
          <YAxis
            unit=" °C"
            width={56}
            tick={{ fill: "#909090", fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: "#4a4a4a" }}
            domain={["auto", "auto"]}
          />
          <Tooltip
            contentStyle={{
              background: "#2a2a2a",
              border: "1px solid #4a4a4a",
              fontSize: 12,
            }}
          />
          <Legend />
          <Line
            name="Measured (paper)"
            type="monotone"
            dataKey="measuredC"
            stroke="#f08c69"
            strokeWidth={2}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            name="Predicted (Vide)"
            type="monotone"
            dataKey="predictedC"
            stroke="#20b8ed"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function CasePanel({ entry }: { entry: ProofLabCaseResult }) {
  const [windowIndex, setWindowIndex] = useState(0);
  const window = entry.windows[windowIndex] ?? entry.windows[0];
  if (!window) return null;

  return (
    <article className="validation-card proof-lab__case">
      <header className="validation-card__header">
        <div>
          <h3>{entry.title}</h3>
          <p className="validation-card__meta">{entry.citation}</p>
        </div>
        <span className="validation-pill is-ready">Blind run complete</span>
      </header>

      <div className="proof-lab__banner">
        <strong>Blind protocol.</strong> Vide simulated from locked paper inputs only. Measured
        paper values were compared afterward — the solver never saw them.
        {entry.measurementTarget === "skin_surface"
          ? " This case compares skin-surface temperature."
          : " This case compares probe/thermode interface temperature."}
      </div>

      <div className="proof-lab__target">
        Compared quantity:{" "}
        <code>
          {entry.measurementTarget === "skin_surface"
            ? "skin surface temperature"
            : "thermode / probe interface temperature"}
        </code>
        <p>{entry.measurementNote}</p>
      </div>

      <div className="proof-lab__windows" role="tablist" aria-label="Comparison windows">
        {entry.windows.map((item, index) => (
          <button
            key={item.label}
            type="button"
            role="tab"
            aria-selected={windowIndex === index}
            className={`proof-lab__window-tab${windowIndex === index ? " is-active" : ""}`}
            onClick={() => setWindowIndex(index)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <WindowChart entry={entry} window={window} />
      <MetricsTable window={window} />

      <details className="proof-lab__details">
        <summary>Paper inputs Vide used (no measured data)</summary>
        <ul>
          {Object.entries(entry.protocolInputs).map(([key, value]) => (
            <li key={key}>
              <code>{key}</code> = {value}
            </li>
          ))}
        </ul>
      </details>

      {entry.caveats.length > 0 && (
        <ul className="result-warnings">
          {entry.caveats.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </article>
  );
}

export function ProofLabDashboard() {
  const open = useExperimentStore((s) => s.showProofLab);
  const status = useExperimentStore((s) => s.proofLabStatus);
  const error = useExperimentStore((s) => s.proofLabError);
  const report = useExperimentStore((s) => s.proofLabResult);
  const close = useExperimentStore((s) => s.closeProofLab);
  const run = useExperimentStore((s) => s.runProofLab);

  if (!open) return null;

  return (
    <div className="validation-dashboard" role="dialog" aria-modal="true">
      <div className="validation-dashboard__panel proof-lab">
        <header className="validation-dashboard__header">
          <div>
            <h2 id="proof-lab-title">Proof lab · blind paper comparison</h2>
            <p className="validation-panel__subtitle">
              Temporary validation area. Same metrics as literature validation — measured vs
              predicted — with ground truth withheld from the solver.
            </p>
          </div>
          <button type="button" className="sidebar__btn" onClick={close}>
            Close
          </button>
        </header>

        <div className="validation-dashboard__actions">
          <button
            type="button"
            className="sidebar__btn sidebar__btn--primary"
            onClick={() => void run()}
            disabled={status === "running"}
          >
            {status === "running" ? "Running…" : "Re-run blind comparison"}
          </button>
        </div>

        {status === "error" && error && (
          <div className="validation-banner is-warn">{error}</div>
        )}

        {status === "running" && (
          <div className="validation-banner is-info">
            Simulating from protocol inputs, then comparing to extracted paper data…
          </div>
        )}

        {report && (
          <>
            <p className="validation-disclosure">{report.disclosure}</p>
            {report.cases.map((entry) => (
              <CasePanel key={entry.caseId} entry={entry} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
