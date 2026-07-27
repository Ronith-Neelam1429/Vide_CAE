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
import type {
  CrossValidationCase,
  ProofLabCaseResult,
  WindowComparison,
} from "../../lib/simulation";
import { useExperimentStore } from "../../store/experimentStore";
import { ModelDiagnostics } from "../results/ModelDiagnostics";

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

function CrossValidationPanel({ entry }: { entry: CrossValidationCase }) {
  return (
    <article className="validation-card proof-lab__case">
      <header className="validation-card__header">
        <div>
          <h3>{entry.title}</h3>
          <p className="validation-card__meta">{entry.citation}</p>
        </div>
        <span className="validation-pill is-warn">{entry.status}</span>
      </header>
      <div className="proof-lab__banner">
        <strong>{entry.modality === "mechanical" ? "Mechanical" : "Electrical"} transfer check.</strong>{" "}
        Production equations generated predictions before the independent reference
        curve was evaluated. A high error is a visible failed validation, not a hidden
        calibration target.
      </div>
      <div className="validation-chart">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={entry.points} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="#3d3d3d" strokeDasharray="3 3" />
            <XAxis dataKey="x" type="number" unit={` ${entry.xUnit}`} tick={{ fill: "#909090", fontSize: 10 }} tickLine={false} axisLine={{ stroke: "#4a4a4a" }} />
            <YAxis unit={` ${entry.metricUnit}`} width={64} tick={{ fill: "#909090", fontSize: 10 }} tickLine={false} axisLine={{ stroke: "#4a4a4a" }} domain={["auto", "auto"]} />
            <Tooltip contentStyle={{ background: "#2a2a2a", border: "1px solid #4a4a4a", fontSize: 12 }} />
            <Legend />
            <Line name="Independent reference" type="monotone" dataKey="measured" stroke="#f08c69" strokeWidth={2} dot isAnimationActive={false} />
            <Line name="Vide prediction" type="monotone" dataKey="predicted" stroke="#20b8ed" strokeWidth={2} dot isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <table className="proof-lab__metrics">
        <thead><tr><th>Metric</th><th>Value</th><th>Unit</th></tr></thead>
        <tbody>
          <tr><td>Samples</td><td>{entry.points.length}</td><td>—</td></tr>
          <tr><td>RMSE</td><td>{entry.rmse.toFixed(3)}</td><td>{entry.metricUnit}</td></tr>
          <tr><td>MAE</td><td>{entry.mae.toFixed(3)}</td><td>{entry.metricUnit}</td></tr>
          <tr><td>Signed bias</td><td>{entry.signedBias.toFixed(3)}</td><td>{entry.metricUnit}</td></tr>
        </tbody>
      </table>
      <ul className="result-warnings">
        {entry.caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}
      </ul>
    </article>
  );
}

/** Embedded panel for the bottom workspace (no modal chrome). */
export function ProofLabPanel() {
  const status = useExperimentStore((s) => s.proofLabStatus);
  const error = useExperimentStore((s) => s.proofLabError);
  const report = useExperimentStore((s) => s.proofLabResult);
  const run = useExperimentStore((s) => s.runProofLab);
  const simulationResult = useExperimentStore((s) => s.simulationResult);
  const selectedContactId = useExperimentStore((s) => s.selectedContactId);
  const selectContact = useExperimentStore((s) => s.selectContact);

  const heatContacts = simulationResult?.contacts ?? [];
  const activeContact =
    heatContacts.find((c) => c.contactPointId === selectedContactId) ??
    heatContacts[0] ??
    null;

  return (
    <div className="docked-validation proof-lab">
      {activeContact && simulationResult && (
        <section className="proof-lab__diagnostics">
          <header className="docked-validation__header">
            <div>
              <h2>Model diagnostics</h2>
              <p>
                Trust checks for your workspace run — not the paper comparison below.
              </p>
            </div>
            {heatContacts.length > 1 && (
              <select
                className="stimulus-form__select"
                value={activeContact.contactPointId}
                onChange={(event) => selectContact(event.target.value)}
                aria-label="Contact for diagnostics"
              >
                {heatContacts.map((contact) => (
                  <option key={contact.contactPointId} value={contact.contactPointId}>
                    {contact.label} · {contact.skinProfile.label}
                  </option>
                ))}
              </select>
            )}
          </header>
          <ModelDiagnostics
            contact={activeContact}
            verification={simulationResult.manifest.verification}
          />
        </section>
      )}

      <header className="docked-validation__header">
        <div>
          <h2>Blind paper comparison</h2>
          <p>Solver never sees measured data during the run.</p>
        </div>
        <button
          type="button"
          className="sidebar__btn sidebar__btn--primary"
          onClick={() => void run()}
          disabled={status === "running"}
        >
          {status === "running" ? "Running…" : report ? "Re-run" : "Run comparison"}
        </button>
      </header>

      {status === "error" && error && (
        <div className="validation-banner is-warn">{error}</div>
      )}
      {status === "running" && (
        <div className="validation-banner is-info">
          Simulating from protocol inputs, then comparing…
        </div>
      )}
      {report && (
        <>
          <p className="validation-disclosure">{report.disclosure}</p>
          {report.cases.map((entry) => (
            <CasePanel key={entry.caseId} entry={entry} />
          ))}
          {report.crossValidationCases.map((entry) => (
            <CrossValidationPanel key={entry.caseId} entry={entry} />
          ))}
        </>
      )}
      {!report && status === "idle" && (
        <p className="docked-validation__empty">
          Run a blind comparison against locked literature protocols.
        </p>
      )}
    </div>
  );
}

/** @deprecated Prefer ProofLabPanel in the bottom workspace. */
export function ProofLabDashboard() {
  const open = useExperimentStore((s) => s.showProofLab);
  if (!open) return null;
  return null;
}
