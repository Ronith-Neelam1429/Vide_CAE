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
import { exportValidationReport } from "../../lib/exportSimulationCsv";
import type { ValidationCaseResult } from "../../lib/simulation";
import { useExperimentStore } from "../../store/experimentStore";

function formatMetric(value: number | null | undefined, digits = 3): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "Unavailable";
  }
  return value.toFixed(digits);
}

function CaseChart({ entry }: { entry: ValidationCaseResult }) {
  const data = useMemo(() => {
    if (entry.comparison.length > 0) {
      return entry.comparison.map((point) => ({
        timeS: point.timeS,
        measuredC: point.measuredC,
        predictedC: point.predictedC,
      }));
    }
    return entry.predictedSeries.map((sample) => ({
      timeS: sample.timeS,
      measuredC: null as number | null,
      predictedC: sample.surfaceTemperatureC,
    }));
  }, [entry]);

  return (
    <div className="validation-chart" aria-label={`${entry.title} measured vs predicted`}>
      <ResponsiveContainer width="100%" height={260}>
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
          {entry.comparison.length > 0 && (
            <Line
              name="Measured"
              type="monotone"
              dataKey="measuredC"
              stroke="#f08c69"
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          )}
          <Line
            name="Predicted"
            type="monotone"
            dataKey="predictedC"
            stroke="#20b8ed"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      {entry.comparison.length === 0 && (
        <p className="validation-chart__caption">
          Blue line = model prediction for this paper’s protocol. Orange lab overlay
          appears once a measured CSV is ingested.
        </p>
      )}
    </div>
  );
}

function CaseCard({ entry }: { entry: ValidationCaseResult }) {
  const hasMeasured = entry.comparison.length > 0;
  return (
    <article className="validation-card">
      <header className="validation-card__header">
        <div>
          <h3>{entry.title}</h3>
          <p className="validation-card__meta">
            {entry.split === "calibration" ? "Used for tuning" : "Held out for check"} ·{" "}
            {entry.measurementTarget === "skin_surface"
              ? "compares skin temperature"
              : "compares device temperature"}
            {entry.synthetic ? " · test fixture only" : ""}
          </p>
        </div>
        <span
          className={`validation-pill${
            hasMeasured ? " is-ready" : " is-wait"
          }`}
        >
          {hasMeasured ? "Has lab data" : "Prediction only (no lab CSV yet)"}
        </span>
      </header>

      <p className="validation-card__citation">{entry.citation}</p>

      <CaseChart entry={entry} />

      <dl className="validation-metrics">
        <div>
          <dt>Model peak skin</dt>
          <dd>{entry.peakPredictedSurfaceC.toFixed(2)} °C</dd>
        </div>
        <div>
          <dt>Lab peak skin</dt>
          <dd>
            {entry.peakMeasuredC === null
              ? "No lab data"
              : `${entry.peakMeasuredC.toFixed(2)} °C`}
          </dd>
        </div>
        {hasMeasured && (
          <>
            <div>
              <dt>Average error (RMSE)</dt>
              <dd>{formatMetric(entry.metrics.rmseC)} °C</dd>
            </div>
            <div>
              <dt>Peak mismatch</dt>
              <dd>{formatMetric(entry.metrics.peakTemperatureErrorC)} °C</dd>
            </div>
          </>
        )}
      </dl>

      {!hasMeasured && (
        <div className="validation-unavailable">
          No measured skin temperature CSV for this paper yet — chart is the model
          prediction for that published protocol only.
        </div>
      )}

      <details className="validation-card__details">
        <summary>Technical notes</summary>
        <p className="validation-card__note">{entry.availabilityNote}</p>
        <ul className="validation-caveats">
          {entry.lockedParameters.map((parameter) => (
            <li key={`${entry.caseId}-${parameter.key}-${parameter.source}`}>
              {parameter.key} = {parameter.value.toPrecision(4)} {parameter.unit}{" "}
              ({parameter.source})
            </li>
          ))}
          {entry.caveats.map((caveat) => (
            <li key={caveat}>{caveat}</li>
          ))}
        </ul>
      </details>
    </article>
  );
}

export function ValidationDashboard() {
  const open = useExperimentStore((s) => s.showValidationDashboard);
  const status = useExperimentStore((s) => s.validationStatus);
  const error = useExperimentStore((s) => s.validationError);
  const report = useExperimentStore((s) => s.validationResult);
  const close = useExperimentStore((s) => s.closeValidationDashboard);
  const runValidationSuite = useExperimentStore((s) => s.runValidationSuite);
  const simulationResult = useExperimentStore((s) => s.simulationResult);
  const [showAudit, setShowAudit] = useState(false);

  if (!open) return null;

  const literatureCases = report?.cases.filter((entry) => !entry.synthetic) ?? [];

  return (
    <div className="validation-dashboard" role="dialog" aria-modal="true">
      <div className="validation-dashboard__panel">
        <header className="validation-dashboard__header">
          <div>
            <h2>Compare to published studies</h2>
            <p>
              Optional check: re-run the solver on fixed paper protocols and overlay
              lab measurements when we have them. This is not your workspace contact
              result — that lives in Results and the bottom Simulation output panel.
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
            disabled={status === "running"}
            onClick={() => void runValidationSuite({ includeSyntheticFixtures: false })}
          >
            {status === "running" ? "Running…" : "Re-run paper protocols"}
          </button>
          {report && (
            <button
              type="button"
              className="sidebar__btn"
              onClick={() => exportValidationReport(report)}
            >
              Export report
            </button>
          )}
          <button
            type="button"
            className="sidebar__btn"
            onClick={() => setShowAudit((value) => !value)}
          >
            {showAudit ? "Hide data sources" : "Show data sources"}
          </button>
        </div>

        {simulationResult && (
          <div className="validation-banner is-info">
            Your latest workspace run ({simulationResult.contacts.length} contact
            {simulationResult.contacts.length === 1 ? "" : "s"}) is separate. Charts
            below are standard paper cases used for accuracy checks.
          </div>
        )}

        <div className="validation-banner is-warn">
          Plain English: we do not yet have open lab CSV files of skin temperature
          under the heater for these papers, so you will see the model’s predicted
          curve only. Metrics stay blank until measured data is added — that is
          honest, not a failed run.
        </div>

        {error && (
          <div className="sidebar__error" role="alert">
            {error}
          </div>
        )}

        {status === "running" && (
          <div className="validation-banner is-info">
            Solving locked calibration and hold-out protocols…
          </div>
        )}

        {report && (
          <>
            <section className="validation-summary">
              <div>
                <span>Solver</span>
                <strong>{report.modelVersion}</strong>
              </div>
              <div>
                <span>Tuned to lab data?</span>
                <strong>{report.calibrated ? "Yes" : "Not yet"}</strong>
              </div>
              <div>
                <span>Paper cases</span>
                <strong>{literatureCases.length}</strong>
              </div>
              <div>
                <span>What this means</span>
                <strong>Side-by-side only</strong>
              </div>
            </section>

            <p className="validation-disclosure">
              No pass/fail badge. If measured data is missing, “Unavailable” metrics are
              expected. Your body placement does not change these locked paper cases.
            </p>

            {report.lockedParameters.length > 0 && (
              <div className="validation-locked">
                <strong>Suite-level locked parameters</strong>
                <ul>
                  {report.lockedParameters.map((parameter) => (
                    <li key={`${parameter.key}-${parameter.source}`}>
                      {parameter.key} = {parameter.value.toPrecision(4)} {parameter.unit}{" "}
                      <span>({parameter.source})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="validation-grid">
              {literatureCases.map((entry) => (
                <CaseCard key={entry.caseId} entry={entry} />
              ))}
            </div>

            {showAudit && (
              <pre className="validation-audit">{report.sourceAudit}</pre>
            )}
          </>
        )}
      </div>
    </div>
  );
}
