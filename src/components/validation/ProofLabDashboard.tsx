import { useEffect, useMemo, useState } from "react";
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
  ProofLabLibraryEntry,
  ProofLabReport,
  WindowComparison,
} from "../../lib/simulation";
import {
  accuracyTone,
  accuracyVerdictSentence,
  computeProtocolMatch,
  formatDurationS,
  formatProofLabNumber,
  formatProofLabPercent,
  formatProofLabSigned,
  formatProofLabTemp,
  isSingleValueMetric,
  protocolMismatchSentence,
  windowMetricsForDisplay,
  type ProtocolMatchResult,
} from "../../lib/proofLabProtocol";
import { useExperimentStore } from "../../store/experimentStore";
import {
  formatParamKey,
  metricDescription,
  PROOF_LAB_CATEGORY_HELP,
  PROOF_LAB_COLUMN_HELP,
  PROOF_LAB_METRIC_HELP,
} from "../../lib/proofLabGlossary";

function formatMetric(value: number | null | undefined, unit = ""): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (unit.includes("°C")) return formatProofLabNumber(value, 1, unit);
  if (unit.includes("%")) return formatProofLabPercent(value);
  return formatProofLabNumber(value, 1, unit);
}

function formatSigned(value: number | null | undefined, unit = ""): string {
  if (unit.includes("°C") || unit === " °C") {
    return formatProofLabSigned(value, 1, unit || " °C");
  }
  if (unit.includes("%")) return formatProofLabPercent(value);
  return formatProofLabSigned(value, 1, unit);
}

function modalityLabel(modality: string): string {
  if (modality === "mechanical") return "Mechanical";
  if (modality === "electrical") return "Electrical";
  return "Heat";
}

function InfoTip({ text }: { text: string }) {
  if (!text) return null;
  return (
    <span className="proof-lab__info" title={text} aria-label={text}>
      i
    </span>
  );
}

function MetricCards({
  metrics,
  protocolMatched,
}: {
  metrics: ExperimentMetric[];
  protocolMatched: boolean;
}) {
  if (metrics.length === 0) {
    return <p className="proof-lab__empty-inline">No metrics for this window.</p>;
  }
  return (
    <div className="proof-lab__metric-stack">
      {!protocolMatched && (
        <p className="proof-lab__mismatch-note">
          These numbers reflect a protocol difference, not model error — match the protocol to
          test accuracy.
        </p>
      )}
      <div className="proof-lab__metric-grid">
        {metrics.map((metric) => {
          const help = metricDescription(metric);
          const single = isSingleValueMetric(metric);
          return (
            <article
              key={metric.id}
              className={`proof-lab__metric-card is-${metric.category}${single ? " is-single" : ""}`}
            >
              <header>
                <div className="proof-lab__metric-label">
                  <span>{metric.label}</span>
                  <InfoTip text={help} />
                </div>
                <small>{metric.unit}</small>
              </header>
              {single ? (
                <div className="proof-lab__metric-single">
                  <strong>{formatMetric(metric.videValue, ` ${metric.unit}`)}</strong>
                  {metric.note && <p className="proof-lab__metric-note">{metric.note}</p>}
                </div>
              ) : (
                <>
                  <div className="proof-lab__metric-compare">
                    <div>
                      <em>Published study</em>
                      <strong>{formatMetric(metric.paperValue, ` ${metric.unit}`)}</strong>
                    </div>
                    <div className="proof-lab__metric-vs" aria-hidden>
                      vs
                    </div>
                    <div>
                      <em>Your simulation</em>
                      <strong>{formatMetric(metric.videValue, ` ${metric.unit}`)}</strong>
                    </div>
                  </div>
                  <footer>
                    <span title={PROOF_LAB_COLUMN_HELP.delta}>
                      Gap {formatSigned(metric.absoluteError, ` ${metric.unit}`)}
                    </span>
                    {metric.relativeErrorPct !== null &&
                      metric.relativeErrorPct !== undefined && (
                        <span title={PROOF_LAB_COLUMN_HELP.relative}>
                          {formatProofLabPercent(metric.relativeErrorPct)}
                        </span>
                      )}
                  </footer>
                  {metric.note && <p className="proof-lab__metric-note">{metric.note}</p>}
                </>
              )}
            </article>
          );
        })}
      </div>
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
                    {point.xLabel} {formatProofLabNumber(point.x, 1)} {point.xUnit}
                  </small>
                </div>
              </td>
              <td>{formatMetric(point.paperValue, ` ${point.unit}`)}</td>
              <td>{formatMetric(point.videValue, ` ${point.unit}`)}</td>
              <td>{formatSigned(point.absoluteError, ` ${point.unit}`)}</td>
              <td>
                {point.relativeErrorPct === null
                  ? "—"
                  : formatProofLabPercent(point.relativeErrorPct)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChartTooltipContent({
  active,
  payload,
  label,
  yUnit = " °C",
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | null; color?: string }>;
  label?: number;
  yUnit?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="proof-lab__chart-tooltip">
      <p>{formatProofLabNumber(label, 1, " s")}</p>
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}:{" "}
          {entry.value === null || entry.value === undefined
            ? "—"
            : formatProofLabNumber(entry.value, 1, yUnit)}
        </p>
      ))}
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
          <Tooltip content={<ChartTooltipContent yUnit=" °C" />} />
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

function measurementTargetLabel(target: ProofLabLibraryEntry["measurementTarget"]): string {
  if (target === "skin_surface") return "Skin surface temperature";
  if (target === "thermode_interface") return "Probe / thermode interface";
  return "Modality-specific curve";
}

function PaperLibrary({
  entries,
  selectedIds,
  onToggle,
  onSelectAll,
  onClear,
}: {
  entries: ProofLabLibraryEntry[];
  selectedIds: string[];
  onToggle: (caseId: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  const heat = entries.filter((e) => e.modality === "heat");
  const other = entries.filter((e) => e.modality !== "heat");

  const renderCard = (entry: ProofLabLibraryEntry) => {
    const selected = selectedIds.includes(entry.caseId);
    return (
      <label
        key={entry.caseId}
        className={`proof-lab__paper${selected ? " is-selected" : ""}`}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(entry.caseId)}
        />
        <div className="proof-lab__paper-body">
          <header>
            <span className={`proof-lab__pill is-modality`}>{modalityLabel(entry.modality)}</span>
            <span className="proof-lab__paper-status">{entry.status}</span>
          </header>
          <h4>{entry.title}</h4>
          <p className="proof-lab__paper-meta">
            {entry.site}
            {entry.setpointC !== null && entry.setpointC !== undefined
              ? ` · ${entry.setpointC} °C`
              : ""}
            {entry.durationS !== null && entry.durationS !== undefined
              ? ` · ${Math.round(entry.durationS / 60)} min`
              : ""}
          </p>
          <p className="proof-lab__paper-summary">{entry.measurementSummary}</p>
          {entry.measurementTarget && (
            <p className="proof-lab__paper-target">
              Measures: {measurementTargetLabel(entry.measurementTarget)}
            </p>
          )}
          {entry.highlights[0] && (
            <p className="proof-lab__paper-highlight">{entry.highlights[0]}</p>
          )}
        </div>
      </label>
    );
  };

  return (
    <section className="proof-lab__library">
      <header className="proof-lab__library-header">
        <div>
          <h3>Research library</h3>
          <p>
            Pick which published studies to compare your simulation against ({selectedIds.length}{" "}
            selected).
          </p>
        </div>
        <div className="proof-lab__library-actions">
          <button type="button" className="sidebar__btn" onClick={onSelectAll}>
            Select all
          </button>
          <button type="button" className="sidebar__btn" onClick={onClear}>
            Clear
          </button>
        </div>
      </header>
      {heat.length > 0 && (
        <>
          <h4 className="proof-lab__library-group">Heat · tissue temperature studies</h4>
          <div className="proof-lab__paper-grid">{heat.map(renderCard)}</div>
        </>
      )}
      {other.length > 0 && (
        <>
          <h4 className="proof-lab__library-group">Transfer checks · mechanical & electrical</h4>
          <div className="proof-lab__paper-grid">{other.map(renderCard)}</div>
        </>
      )}
    </section>
  );
}

function formatProtocolValue(key: string, value: number): string {
  if (key === "temperatureC" || key === "baselineSkinTemperatureC" || key === "ambientTemperatureC") {
    return formatProofLabTemp(value);
  }
  if (key === "durationS" || key === "postExposureS") return formatDurationS(value);
  if (key === "contactAreaMm2") return formatProofLabNumber(value, 1, " mm²");
  return formatProofLabNumber(value, 1);
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
                <td>{p !== undefined ? formatProtocolValue(key, p) : "—"}</td>
                <td>{y !== undefined ? formatProtocolValue(key, y) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ProtocolVerdict({
  entry,
  window,
  protocolMatch,
  onMatchProtocol,
  matching,
}: {
  entry: ProofLabCaseResult;
  window: WindowComparison;
  protocolMatch: ProtocolMatchResult;
  onMatchProtocol: () => void;
  matching: boolean;
}) {
  const rmse = window.metrics.rmseC;
  const mae = window.metrics.maeC;

  if (!protocolMatch.matched) {
    return (
      <section className="proof-lab__verdict verdict-card is-neutral" aria-live="polite">
        <div className="verdict-card__top">
          <div className="verdict-card__identity">
            <strong>{entry.title}</strong>
            <span>{entry.contactLabel}</span>
          </div>
          <div className="verdict-card__badges">
            <div className="verdict-card__badge is-neutral">
              <span className="verdict-card__badge-label">Protocol match</span>
              <span className="verdict-card__badge-value">Mismatch</span>
              <span className="verdict-card__badge-threshold">
                Not a fair comparison yet
              </span>
            </div>
          </div>
        </div>
        <p className="verdict-card__sentence">{protocolMismatchSentence(protocolMatch.mismatches)}</p>
        <div className="proof-lab__verdict-actions">
          <button
            type="button"
            className="sidebar__btn sidebar__btn--primary"
            onClick={onMatchProtocol}
            disabled={matching}
          >
            {matching ? "Applying…" : "Match this study's protocol"}
          </button>
        </div>
      </section>
    );
  }

  const tone = accuracyTone(rmse);
  return (
    <section className={`proof-lab__verdict verdict-card is-${tone}`} aria-live="polite">
      <div className="verdict-card__top">
        <div className="verdict-card__identity">
          <strong>{entry.title}</strong>
          <span>{entry.contactLabel}</span>
        </div>
        <div className="verdict-card__badges">
          <div className="verdict-card__badge is-close">
            <span className="verdict-card__badge-label">Protocol match</span>
            <span className="verdict-card__badge-value">Matched</span>
            <span className="verdict-card__badge-threshold">Apples-to-apples comparison</span>
          </div>
          <div className={`verdict-card__badge is-${tone}`}>
            <span className="verdict-card__badge-label">Model accuracy</span>
            <span className="verdict-card__badge-value">
              {tone === "close" ? "Tracks" : tone === "mixed" ? "Partial" : "Gap"}
            </span>
            <span className="verdict-card__badge-threshold">
              RMSE {formatProofLabNumber(rmse, 1, " °C")}
            </span>
          </div>
        </div>
      </div>
      <p className="verdict-card__sentence">{accuracyVerdictSentence(rmse, mae)}</p>
      <div className="verdict-card__hero">
        <div className="verdict-card__hero-main">
          <span className="verdict-card__hero-label">Typical gap (RMSE)</span>
          <strong className="verdict-card__hero-value">
            {formatProofLabNumber(rmse, 1)}
            <span> °C</span>
          </strong>
        </div>
        <div className="verdict-card__hero-side">
          <div>
            <span>Avg mismatch (MAE)</span>
            <strong>{formatProofLabNumber(mae, 1, " °C")}</strong>
          </div>
          <div>
            <span>Bias (you − study)</span>
            <strong>{formatProofLabSigned(window.metrics.signedBiasC, 1, " °C")}</strong>
          </div>
          <div>
            <span>Time-to-peak error</span>
            <strong>{formatProofLabSigned(window.metrics.timeToPeakErrorS, 1, " s")}</strong>
          </div>
        </div>
      </div>
    </section>
  );
}

function MetricDetailSection({
  entry,
  window,
  displayMetrics,
  protocolMatched,
}: {
  entry: ProofLabCaseResult;
  window: WindowComparison;
  displayMetrics: ExperimentMetric[];
  protocolMatched: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="physics-detail proof-lab__detail">
      <button
        type="button"
        className="physics-detail__toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className={`result-section__chevron${open ? " is-open" : ""}`}>›</span>
        Metric detail
        <span className="physics-detail__hint">protocol · cards · checkpoints</span>
      </button>
      {open && (
        <div className="physics-detail__body">
          <ProtocolCompare
            title="Protocol · published study vs your sidebar"
            paper={entry.paperReferenceInputs}
            yours={entry.protocolInputs}
          />
          <MetricCards metrics={displayMetrics} protocolMatched={protocolMatched} />
          <h4 className="proof-lab__detail-heading">Checkpoint-by-checkpoint</h4>
          <DataPointTable
            points={window.keyDataPoints}
            emptyLabel="No measured checkpoints in this window."
          />
        </div>
      )}
    </section>
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
  report,
}: {
  analysis: ProofLabAnalysis | null;
  status: "idle" | "running" | "complete" | "error";
  error: string | null;
  onRefresh: () => void;
  report: ProofLabReport;
}) {
  const protocolByCase = useMemo(() => {
    const map = new Map<string, ProtocolMatchResult>();
    for (const entry of report.cases) {
      map.set(
        entry.caseId,
        computeProtocolMatch(entry.paperReferenceInputs, entry.protocolInputs),
      );
    }
    return map;
  }, [report.cases]);

  return (
    <section className="proof-lab__ai">
      <header className="proof-lab__ai-header">
        <div>
          <p className="proof-lab__eyebrow">AI comparison brief</p>
          <h3>{analysis?.headline ?? "Interpretation beyond the numbers"}</h3>
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
        <p className="proof-lab__ai-status">Reading protocol alignment and residuals…</p>
      )}
      {status === "error" && error && <p className="proof-lab__ai-status is-warn">{error}</p>}
      {analysis && (
        <>
          <p className="proof-lab__ai-summary">{analysis.summary}</p>
          <div className="proof-lab__ai-briefs">
            {analysis.caseBriefs.map((brief) => {
              const protocolMatch = protocolByCase.get(brief.caseId);
              const agreementClass =
                brief.agreement === "protocol-mismatch" ? "protocol-mismatch" : brief.agreement;
              return (
                <article
                  key={brief.caseId}
                  className={`proof-lab__ai-brief is-${agreementClass}`}
                >
                  <header>
                    <h4>{brief.headline}</h4>
                    <span>
                      {brief.agreement === "protocol-mismatch"
                        ? "Protocol mismatch"
                        : brief.agreement}
                    </span>
                  </header>
                  {protocolMatch && !protocolMatch.matched && (
                    <p className="proof-lab__ai-protocol">
                      {protocolMismatchSentence(protocolMatch.mismatches)}
                    </p>
                  )}
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
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

function CasePanel({
  entry,
  onMatchProtocol,
  matching,
}: {
  entry: ProofLabCaseResult;
  onMatchProtocol: (entry: ProofLabCaseResult) => void;
  matching: boolean;
}) {
  const [windowIndex, setWindowIndex] = useState(0);
  const window = entry.windows[windowIndex] ?? entry.windows[0];
  const protocolMatch = useMemo(
    () => computeProtocolMatch(entry.paperReferenceInputs, entry.protocolInputs),
    [entry.paperReferenceInputs, entry.protocolInputs],
  );
  const displayMetrics = useMemo(
    () => (window ? windowMetricsForDisplay(window.experimentMetrics) : []),
    [window],
  );
  if (!window) return null;

  return (
    <article className="proof-lab__case result-story">
      <header className="proof-lab__case-header proof-lab__case-header--compact">
        <div className="proof-lab__case-tags">
          <span className="proof-lab__pill is-modality">{modalityLabel(entry.modality)}</span>
          <span className="proof-lab__pill is-user">Your sidebar · {entry.contactLabel}</span>
        </div>
        <p className="proof-lab__citation">{entry.citation}</p>
        {entry.measurementNote && (
          <p className="proof-lab__measurement-note">{entry.measurementNote}</p>
        )}
      </header>

      <ProtocolVerdict
        entry={entry}
        window={window}
        protocolMatch={protocolMatch}
        onMatchProtocol={() => onMatchProtocol(entry)}
        matching={matching}
      />

      {entry.windows.length > 1 && (
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
      )}

      <section className="result-story__charts">
        <WindowChart entry={entry} window={window} />
      </section>

      <MetricDetailSection
        entry={entry}
        window={window}
        displayMetrics={displayMetrics}
        protocolMatched={protocolMatch.matched}
      />

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
                  <code>{key}</code> = {formatProtocolValue(key, value)}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h5>Published protocol reference</h5>
            <ul>
              {Object.entries(entry.paperReferenceInputs).map(([key, value]) => (
                <li key={key}>
                  <code>{key}</code> = {formatProtocolValue(key, value)}
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
  const [detailOpen, setDetailOpen] = useState(false);
  const tone = accuracyTone(entry.rmse);

  return (
    <article className="proof-lab__case result-story">
      <section className={`proof-lab__verdict verdict-card is-${tone}`} aria-live="polite">
        <div className="verdict-card__top">
          <div className="verdict-card__identity">
            <strong>{entry.title}</strong>
            <span>Transfer check · {modalityLabel(entry.modality)}</span>
          </div>
          <div className="verdict-card__badges">
            <div className="verdict-card__badge is-neutral">
              <span className="verdict-card__badge-label">Comparison type</span>
              <span className="verdict-card__badge-value">Transfer check</span>
              <span className="verdict-card__badge-threshold">Cross-model, not calibration</span>
            </div>
          </div>
        </div>
        <p className="verdict-card__sentence">
          Compares Vide model {entry.metricLabel.toLowerCase()} predictions to an independent
          published curve — high error here means different model families, not a failed sidebar
          match.
        </p>
        <div className="verdict-card__hero">
          <div className="verdict-card__hero-main">
            <span className="verdict-card__hero-label">Aggregate RMSE</span>
            <strong className="verdict-card__hero-value">
              {formatProofLabNumber(entry.rmse, 1)}
              <span> {entry.metricUnit}</span>
            </strong>
          </div>
          <div className="verdict-card__hero-side">
            <div>
              <span>MAE</span>
              <strong>
                {formatProofLabNumber(entry.mae, 1)} {entry.metricUnit}
              </strong>
            </div>
            <div>
              <span>Bias</span>
              <strong>
                {formatProofLabSigned(entry.signedBias, 1, ` ${entry.metricUnit}`)}
              </strong>
            </div>
          </div>
        </div>
      </section>

      <section className="result-story__charts">
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
              <Tooltip content={<ChartTooltipContent yUnit={` ${entry.metricUnit}`} />} />
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
      </section>

      <section className="physics-detail proof-lab__detail">
        <button
          type="button"
          className="physics-detail__toggle"
          aria-expanded={detailOpen}
          onClick={() => setDetailOpen(!detailOpen)}
        >
          <span className={`result-section__chevron${detailOpen ? " is-open" : ""}`}>›</span>
          Metric detail
          <span className="physics-detail__hint">cards · checkpoints</span>
        </button>
        {detailOpen && (
          <div className="physics-detail__body">
            <MetricCards metrics={entry.experimentMetrics} protocolMatched />
            <h4 className="proof-lab__detail-heading">Checkpoint-by-checkpoint</h4>
            <DataPointTable
              points={entry.keyDataPoints}
              emptyLabel="No transfer points available."
            />
          </div>
        )}
      </section>

      <ul className="result-warnings">
        {entry.caveats.map((caveat) => (
          <li key={caveat}>{caveat}</li>
        ))}
      </ul>
      {brief && <p className="proof-lab__brief-note">{brief.headline}</p>}
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
  const library = useExperimentStore((s) => s.proofLabLibrary);
  const libraryStatus = useExperimentStore((s) => s.proofLabLibraryStatus);
  const selectedCaseIds = useExperimentStore((s) => s.proofLabSelectedCaseIds);
  const loadLibrary = useExperimentStore((s) => s.loadProofLabLibrary);
  const toggleCase = useExperimentStore((s) => s.toggleProofLabCase);
  const selectAllCases = useExperimentStore((s) => s.selectAllProofLabCases);
  const clearCases = useExperimentStore((s) => s.clearProofLabCases);
  const contactPoints = useExperimentStore((s) => s.contactPoints);
  const assignments = useExperimentStore((s) => s.assignments);
  const selectedContactId = useExperimentStore((s) => s.selectedContactId);
  const selectContact = useExperimentStore((s) => s.selectContact);
  const applyProofLabStudyProtocol = useExperimentStore((s) => s.applyProofLabStudyProtocol);
  const [matchingCaseId, setMatchingCaseId] = useState<string | null>(null);

  const handleMatchProtocol = async (entry: ProofLabCaseResult) => {
    if (!activeContactId) return;
    setMatchingCaseId(entry.caseId);
    applyProofLabStudyProtocol(
      activeContactId,
      entry.paperReferenceInputs,
      entry.paperReferenceOptions,
    );
    try {
      await run();
    } finally {
      setMatchingCaseId(null);
    }
  };

  useEffect(() => {
    if (libraryStatus === "idle") {
      void loadLibrary();
    }
  }, [libraryStatus, loadLibrary]);

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
            Choose studies from the library, then run your contact settings against their
            published checkpoints.
          </p>
        </div>
        <button
          type="button"
          className="sidebar__btn sidebar__btn--primary"
          onClick={() => void run()}
          disabled={
            status === "running" ||
            selectedCaseIds.length === 0 ||
            (selectedCaseIds.some((id) =>
              library.find((e) => e.caseId === id)?.requiresHeatContact,
            ) &&
              heatContacts.length === 0)
          }
        >
          {status === "running"
            ? "Running…"
            : report
              ? "Re-run comparison"
              : "Run comparison"}
        </button>
      </header>

      {libraryStatus === "ready" && library.length > 0 && (
        <PaperLibrary
          entries={library}
          selectedIds={selectedCaseIds}
          onToggle={toggleCase}
          onSelectAll={selectAllCases}
          onClear={clearCases}
        />
      )}
      {libraryStatus === "loading" && (
        <p className="proof-lab__library-loading">Loading research library…</p>
      )}

      {selectedCaseIds.some(
        (id) => library.find((e) => e.caseId === id)?.requiresHeatContact,
      ) && (
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
      )}

      {activeAssignment &&
        selectedCaseIds.some(
          (id) => library.find((e) => e.caseId === id)?.requiresHeatContact,
        ) && (
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
                  onMatchProtocol={handleMatchProtocol}
                  matching={matchingCaseId === entry.caseId}
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
              report={report}
            />
          </aside>
        </div>
      )}

      {!report && status === "idle" && selectedCaseIds.length > 0 && (
        <p className="docked-validation__empty">
          Press Run comparison to score your sidebar against the selected studies.
        </p>
      )}
      {!report && status === "idle" && selectedCaseIds.length === 0 && (
        <p className="docked-validation__empty">
          Select at least one study from the research library above.
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
