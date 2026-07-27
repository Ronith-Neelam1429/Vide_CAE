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
import type { ProofLabAnalysis } from "../../lib/assist";
import type {
  CrossValidationCase,
  DataPointCompare,
  ExperimentMetric,
  ProofLabCaseResult,
  WindowComparison,
} from "../../lib/simulation";
import { useExperimentStore } from "../../store/experimentStore";
import {
  formatParamKey,
  metricDescription,
  PROOF_LAB_CATEGORY_HELP,
  PROOF_LAB_COLUMN_HELP,
  PROOF_LAB_METRIC_HELP,
} from "../../lib/proofLabGlossary";

function formatMetric(value: number | null | undefined, digits = 3, unit = ""): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return `${value.toFixed(digits)}${unit}`;
}

function formatSigned(value: number | null | undefined, digits = 3, unit = ""): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}${unit}`;
}

function modalityLabel(modality: string): string {
  if (modality === "mechanical") return "Mechanical";
  if (modality === "electrical") return "Electrical";
  return "Heat";
}

function MetricCards({ metrics }: { metrics: ExperimentMetric[] }) {
  const primary = metrics.filter((metric) => metric.category !== "summary");
  const summary = metrics.filter((metric) => metric.category === "summary");
  return (
    <div className="proof-lab__metric-stack">
      <div className="proof-lab__metric-grid">
        {primary.map((metric) => {
          const help = metricDescription(metric);
          return (
            <article
              key={metric.id}
              className={`proof-lab__metric-card is-${metric.category}`}
              title={help}
            >
              <header>
                <div>
                  <span>{metric.label}</span>
                  {help && <p className="proof-lab__metric-desc">{help}</p>}
                </div>
                <small>{metric.unit}</small>
              </header>
              <div className="proof-lab__metric-compare">
                <div>
                  <em>Published study</em>
                  <strong>{formatMetric(metric.paperValue, 3)}</strong>
                </div>
                <div className="proof-lab__metric-vs" aria-hidden>
                  vs
                </div>
                <div>
                  <em>Your simulation</em>
                  <strong>{formatMetric(metric.videValue, 3)}</strong>
                </div>
              </div>
              <footer>
                <span title={PROOF_LAB_COLUMN_HELP.delta}>
                  Gap {formatSigned(metric.absoluteError, 3, ` ${metric.unit}`)}
                </span>
                {metric.relativeErrorPct !== null && metric.relativeErrorPct !== undefined && (
                  <span title={PROOF_LAB_COLUMN_HELP.relative}>
                    {formatSigned(metric.relativeErrorPct, 1, "%")}
                  </span>
                )}
              </footer>
              {metric.note && <p className="proof-lab__metric-note">{metric.note}</p>}
            </article>
          );
        })}
      </div>
      {summary.length > 0 && (
        <div className="proof-lab__summary-strip">
          {summary.map((metric) => (
            <div key={metric.id} title={metricDescription(metric)}>
              <span>{metric.label}</span>
              <strong>
                {formatMetric(metric.videValue ?? metric.paperValue, 3, ` ${metric.unit}`)}
              </strong>
              {metric.description && (
                <small className="proof-lab__summary-help">{metric.description}</small>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DataPointTable({
  points,
  emptyLabel,
}: {
  points: DataPointCompare[];
  emptyLabel: string;
}) {
  if (points.length === 0) {
    return <p className="proof-lab__empty-inline">{emptyLabel}</p>;
  }
  return (
    <div className="proof-lab__table-wrap">
      <table className="proof-lab__metrics">
        <thead>
          <tr>
            <th>When / what</th>
            <th title={PROOF_LAB_COLUMN_HELP.published}>Published study</th>
            <th title={PROOF_LAB_COLUMN_HELP.yours}>Your simulation</th>
            <th title={PROOF_LAB_COLUMN_HELP.delta}>Gap (you − study)</th>
            <th title={PROOF_LAB_COLUMN_HELP.relative}>% diff</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={`${point.label}-${point.x}`}>
              <td>
                <div className="proof-lab__point-label">
                  <strong>{point.label}</strong>
                  <small>
                    {point.xLabel} {formatMetric(point.x, 2)} {point.xUnit}
                  </small>
                </div>
              </td>
              <td>{formatMetric(point.paperValue, 3, ` ${point.unit}`)}</td>
              <td>{formatMetric(point.videValue, 3, ` ${point.unit}`)}</td>
              <td>{formatSigned(point.absoluteError, 3, ` ${point.unit}`)}</td>
              <td>
                {point.relativeErrorPct === null
                  ? "—"
                  : formatSigned(point.relativeErrorPct, 1, "%")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
    <div className="validation-chart proof-lab__chart" aria-label={`${window.label} overlay`}>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
          <XAxis
            dataKey="timeS"
            type="number"
            unit=" s"
            tick={{ fill: "#9aa3ad", fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: "#3d4650" }}
          />
          <YAxis
            unit=" °C"
            width={56}
            tick={{ fill: "#9aa3ad", fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: "#3d4650" }}
            domain={["auto", "auto"]}
          />
          <Tooltip
            contentStyle={{
              background: "#1c2229",
              border: "1px solid #3d4650",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Legend />
          <Line
            name="Published study"
            type="monotone"
            dataKey="measuredC"
            stroke="#f08c69"
            strokeWidth={2.25}
            dot={window.comparison.length <= 24}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            name="Your simulation"
            type="monotone"
            dataKey="predictedC"
            stroke="#20b8ed"
            strokeWidth={2.25}
            dot={window.comparison.length <= 24}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ProtocolCompare({
  yours,
  paper,
  title,
}: {
  yours: Record<string, number>;
  paper: Record<string, number>;
  title: string;
}) {
  const keys = [
    "temperatureC",
    "durationS",
    "postExposureS",
    "contactAreaMm2",
    "baselineSkinTemperatureC",
    "contactPressureKpa",
  ].filter((key) => yours[key] !== undefined || paper[key] !== undefined);

  if (keys.length === 0) return null;

  return (
    <div className="proof-lab__protocol-compare">
      <h4>{title}</h4>
      <table className="proof-lab__metrics proof-lab__metrics--compact">
        <thead>
          <tr>
            <th>Setting</th>
            <th>Published study</th>
            <th>Your sidebar</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => {
            const y = yours[key];
            const p = paper[key];
            const mismatch = y !== undefined && p !== undefined && Math.abs(y - p) > 1e-6;
            return (
              <tr key={key} className={mismatch ? "is-mismatch" : undefined}>
                <td>{formatParamKey(key)}</td>
                <td>{p !== undefined ? p : "—"}</td>
                <td>{y !== undefined ? y : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function GlossaryPanel() {
  return (
    <details className="proof-lab__glossary">
      <summary>What do these numbers mean?</summary>
      <div className="proof-lab__glossary-grid">
        <div>
          <h5>Column labels</h5>
          <dl>
            <dt>Published study</dt>
            <dd>{PROOF_LAB_COLUMN_HELP.published}</dd>
            <dt>Your simulation</dt>
            <dd>{PROOF_LAB_COLUMN_HELP.yours}</dd>
            <dt>Gap (you − study)</dt>
            <dd>{PROOF_LAB_COLUMN_HELP.delta}</dd>
          </dl>
        </div>
        <div>
          <h5>Common metrics</h5>
          <dl>
            {Object.entries(PROOF_LAB_METRIC_HELP)
              .slice(0, 8)
              .map(([key, text]) => (
                <div key={key}>
                  <dt>{formatParamKey(key)}</dt>
                  <dd>{text}</dd>
                </div>
              ))}
          </dl>
        </div>
        <div>
          <h5>Card types</h5>
          <dl>
            {Object.entries(PROOF_LAB_CATEGORY_HELP).map(([key, text]) => (
              <div key={key}>
                <dt>{formatParamKey(key)}</dt>
                <dd>{text}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </details>
  );
}

function AiPanel({
  analysis,
  status,
  error,
  onRefresh,
}: {
  analysis: ProofLabAnalysis | null;
  status: "idle" | "running" | "complete" | "error";
  error: string | null;
  onRefresh: () => void;
}) {
  return (
    <section className="proof-lab__ai">
      <header className="proof-lab__ai-header">
        <div>
          <p className="proof-lab__eyebrow">AI comparison brief</p>
          <h3>{analysis?.headline ?? "Interpreting paper vs Vide checkpoints"}</h3>
        </div>
        <div className="proof-lab__ai-actions">
          {analysis && (
            <span className={`proof-lab__source is-${analysis.source}`}>
              {analysis.source === "azure" ? "Azure" : "Rules"}
            </span>
          )}
          <button
            type="button"
            className="sidebar__btn"
            onClick={onRefresh}
            disabled={status === "running"}
          >
            {status === "running" ? "Analyzing…" : "Refresh AI"}
          </button>
        </div>
      </header>
      {status === "running" && (
        <p className="proof-lab__ai-status">Reading experiment checkpoints and residuals…</p>
      )}
      {status === "error" && error && <p className="proof-lab__ai-status is-warn">{error}</p>}
      {analysis && (
        <>
          <p className="proof-lab__ai-summary">{analysis.summary}</p>
          <div className="proof-lab__ai-briefs">
            {analysis.caseBriefs.map((brief) => (
              <article key={brief.caseId} className={`proof-lab__ai-brief is-${brief.agreement}`}>
                <header>
                  <h4>{brief.headline}</h4>
                  <span>{brief.agreement}</span>
                </header>
                {brief.highlights.length > 0 && (
                  <ul>
                    {brief.highlights.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
                {brief.concerns.length > 0 && (
                  <ul className="is-concern">
                    {brief.concerns.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function CasePanel({
  entry,
  brief,
}: {
  entry: ProofLabCaseResult;
  brief?: ProofLabAnalysis["caseBriefs"][number];
}) {
  const [windowIndex, setWindowIndex] = useState(0);
  const window = entry.windows[windowIndex] ?? entry.windows[0];
  if (!window) return null;

  return (
    <article className="proof-lab__case">
      <header className="proof-lab__case-header">
        <div>
          <div className="proof-lab__case-tags">
            <span className="proof-lab__pill is-modality">{modalityLabel(entry.modality)}</span>
            <span className="proof-lab__pill is-user">Your sidebar · {entry.contactLabel}</span>
            {brief && <span className={`proof-lab__pill is-${brief.agreement}`}>{brief.agreement}</span>}
          </div>
          <h3>{entry.title}</h3>
          <p className="proof-lab__citation">{entry.citation}</p>
        </div>
        <div className="proof-lab__case-kpis">
          <div title={PROOF_LAB_METRIC_HELP.rmse}>
            <em>Typical gap (RMSE)</em>
            <strong>{formatMetric(window.metrics.rmseC, 3, " °C")}</strong>
          </div>
          <div title={PROOF_LAB_METRIC_HELP.mae}>
            <em>Avg mismatch (MAE)</em>
            <strong>{formatMetric(window.metrics.maeC, 3, " °C")}</strong>
          </div>
          <div title={PROOF_LAB_METRIC_HELP.signed_bias}>
            <em>Bias (hot/cool)</em>
            <strong>{formatSigned(window.metrics.signedBiasC, 3, " °C")}</strong>
          </div>
        </div>
      </header>

      <p className="proof-lab__lede">
        {entry.measurementNote} Each card compares a published checkpoint to what your sidebar
        settings produced. If your temperature or duration differs from the study, large gaps are
        expected — check the protocol table below.
      </p>

      <ProtocolCompare
        title="Protocol · published study vs your sidebar"
        paper={entry.paperReferenceInputs}
        yours={entry.protocolInputs}
      />

      <MetricCards metrics={entry.experimentMetrics.length ? entry.experimentMetrics : window.experimentMetrics} />

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
            <small>{item.sampleCount} pts</small>
          </button>
        ))}
      </div>

      <div className="proof-lab__split">
        <WindowChart entry={entry} window={window} />
        <div className="proof-lab__split-side">
          <h4>Checkpoint-by-checkpoint</h4>
          <DataPointTable
            points={window.keyDataPoints}
            emptyLabel="No measured checkpoints in this window."
          />
        </div>
      </div>

      {window.experimentMetrics.length > 0 && entry.windows.length > 1 && (
        <>
          <h4 className="proof-lab__section-title">Window metrics · {window.label}</h4>
          <MetricCards metrics={window.experimentMetrics} />
        </>
      )}

      <details className="proof-lab__details">
        <summary>Study notes & full parameter lists</summary>
        <div className="proof-lab__details-grid">
          <div>
            <h5>What the study reported</h5>
            <ul>
              {entry.extractedFromPaper.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h5>Your sidebar inputs (used for simulation)</h5>
            <ul>
              {Object.entries(entry.protocolInputs).map(([key, value]) => (
                <li key={key}>
                  <code>{key}</code> = {value}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h5>Published protocol reference</h5>
            <ul>
              {Object.entries(entry.paperReferenceInputs).map(([key, value]) => (
                <li key={key}>
                  <code>{key}</code> = {value}
                </li>
              ))}
            </ul>
          </div>
        </div>
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

function CrossValidationPanel({
  entry,
  brief,
}: {
  entry: CrossValidationCase;
  brief?: ProofLabAnalysis["caseBriefs"][number];
}) {
  return (
    <article className="proof-lab__case">
      <header className="proof-lab__case-header">
        <div>
          <div className="proof-lab__case-tags">
            <span className="proof-lab__pill is-modality">{modalityLabel(entry.modality)}</span>
            <span className="proof-lab__pill is-transfer">Transfer check</span>
            {brief && <span className={`proof-lab__pill is-${brief.agreement}`}>{brief.agreement}</span>}
          </div>
          <h3>{entry.title}</h3>
          <p className="proof-lab__citation">{entry.citation}</p>
        </div>
        <div className="proof-lab__case-kpis">
          <div>
            <em>RMSE</em>
            <strong>
              {entry.rmse.toFixed(3)} {entry.metricUnit}
            </strong>
          </div>
          <div>
            <em>MAE</em>
            <strong>
              {entry.mae.toFixed(3)} {entry.metricUnit}
            </strong>
          </div>
          <div>
            <em>Bias</em>
            <strong>
              {formatSigned(entry.signedBias, 3)} {entry.metricUnit}
            </strong>
          </div>
        </div>
      </header>

      <p className="proof-lab__lede">
        Every published {entry.metricLabel.toLowerCase()} is listed beside Vide’s prediction for the
        same {entry.xLabel.toLowerCase()}. High error here is a visible failed transfer, not a hidden
        calibration target.
      </p>

      <MetricCards metrics={entry.experimentMetrics} />

      <div className="proof-lab__split">
        <div className="validation-chart proof-lab__chart">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={entry.points} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
              <XAxis
                dataKey="x"
                type="number"
                unit={` ${entry.xUnit}`}
                tick={{ fill: "#9aa3ad", fontSize: 10 }}
                tickLine={false}
                axisLine={{ stroke: "#3d4650" }}
              />
              <YAxis
                unit={` ${entry.metricUnit}`}
                width={64}
                tick={{ fill: "#9aa3ad", fontSize: 10 }}
                tickLine={false}
                axisLine={{ stroke: "#3d4650" }}
                domain={["auto", "auto"]}
              />
              <Tooltip
                contentStyle={{
                  background: "#1c2229",
                  border: "1px solid #3d4650",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Legend />
              <Line
                name="Published study"
                type="monotone"
                dataKey="measured"
                stroke="#f08c69"
                strokeWidth={2.25}
                dot
                isAnimationActive={false}
              />
              <Line
                name="Vide model"
                type="monotone"
                dataKey="predicted"
                stroke="#20b8ed"
                strokeWidth={2.25}
                dot
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="proof-lab__split-side">
          <h4>Checkpoint-by-checkpoint</h4>
          <DataPointTable
            points={entry.keyDataPoints}
            emptyLabel="No transfer points available."
          />
        </div>
      </div>

      <ul className="result-warnings">
        {entry.caveats.map((caveat) => (
          <li key={caveat}>{caveat}</li>
        ))}
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
  const analysis = useExperimentStore((s) => s.proofLabAnalysis);
  const analysisStatus = useExperimentStore((s) => s.proofLabAnalysisStatus);
  const analysisError = useExperimentStore((s) => s.proofLabAnalysisError);
  const analyze = useExperimentStore((s) => s.analyzeProofLab);
  const contactPoints = useExperimentStore((s) => s.contactPoints);
  const assignments = useExperimentStore((s) => s.assignments);
  const selectedContactId = useExperimentStore((s) => s.selectedContactId);
  const selectContact = useExperimentStore((s) => s.selectContact);

  const heatContacts = useMemo(
    () =>
      contactPoints.filter((contact) => {
        const assignment = assignments.find((a) => a.contactPointId === contact.id);
        return assignment?.stimulusType === "heat";
      }),
    [assignments, contactPoints],
  );

  const activeContactId = selectedContactId ?? heatContacts[0]?.id ?? null;
  const activeAssignment = assignments.find((a) => a.contactPointId === activeContactId);
  const activeContact = contactPoints.find((c) => c.id === activeContactId);

  const briefById = useMemo(() => {
    const map = new Map<string, ProofLabAnalysis["caseBriefs"][number]>();
    for (const brief of analysis?.caseBriefs ?? []) {
      map.set(brief.caseId, brief);
    }
    return map;
  }, [analysis]);

  return (
    <div className="docked-validation proof-lab">
      <header className="proof-lab__hero">
        <div>
          <p className="proof-lab__eyebrow">Proof Lab</p>
          <h2>Your sidebar vs published studies</h2>
          <p>
            Runs your contact settings against each study&apos;s published measurements — every
            checkpoint, not just averages.
          </p>
        </div>
        <button
          type="button"
          className="sidebar__btn sidebar__btn--primary"
          onClick={() => void run()}
          disabled={status === "running" || heatContacts.length === 0}
        >
          {status === "running" ? "Running…" : report ? "Re-run suite" : "Run comparison"}
        </button>
      </header>

      <div className="proof-lab__setup">
        <div>
          <h3>Contact used for simulation</h3>
          <p>Select the heat contact whose sidebar settings you want to verify.</p>
        </div>
        {heatContacts.length > 0 ? (
          <select
            className="stimulus-form__select"
            value={activeContactId ?? ""}
            onChange={(event) => selectContact(event.target.value)}
            aria-label="Contact for Proof Lab"
          >
            {heatContacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.label}
              </option>
            ))}
          </select>
        ) : (
          <p className="proof-lab__setup-warn">Add a heat contact in the sidebar first.</p>
        )}
      </div>

      {activeAssignment && (
        <div className="proof-lab__scope-banner">
          <strong>Using your sidebar:</strong>{" "}
          {activeContact?.label ?? "Contact"} ·{" "}
          {activeAssignment.parameters.temperatureC ?? "?"} °C ·{" "}
          {activeAssignment.parameters.durationS ?? "?"} s hold · compared to each study&apos;s
          published data (not the study&apos;s protocol).
        </div>
      )}

      <GlossaryPanel />

      {status === "error" && error && (
        <div className="validation-banner is-warn">{error}</div>
      )}
      {status === "running" && (
        <div className="validation-banner is-info">
          Simulating from your sidebar settings, then scoring against published checkpoints…
        </div>
      )}

      {report && (
        <div className="proof-lab__body">
          <div className="proof-lab__main">
            <p className="validation-disclosure">{report.disclosure}</p>
            <div className="proof-lab__case-list">
              {report.cases.map((entry) => (
                <CasePanel
                  key={entry.caseId}
                  entry={entry}
                  brief={briefById.get(entry.caseId)}
                />
              ))}
              {report.crossValidationCases.map((entry) => (
                <CrossValidationPanel
                  key={entry.caseId}
                  entry={entry}
                  brief={briefById.get(entry.caseId)}
                />
              ))}
            </div>
          </div>
          <aside className="proof-lab__aside">
            <AiPanel
              analysis={analysis}
              status={analysisStatus}
              error={analysisError}
              onRefresh={() => void analyze()}
            />
          </aside>
        </div>
      )}

      {!report && status === "idle" && (
        <p className="docked-validation__empty">
          Run the suite to compare locked literature checkpoints against Vide predictions.
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
