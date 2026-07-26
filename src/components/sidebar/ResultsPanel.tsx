import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  exportDepthProfileCsv,
  exportRunManifest,
  exportTimeSeriesCsv,
} from "../../lib/exportSimulationCsv";
import {
  SOLVER_PRESETS,
  type ConvergenceReport,
  type HeatContactResult,
  type ResultSummary,
  type SolverPresetId,
  type VerificationSuite,
} from "../../lib/simulation";
import { useExperimentStore } from "../../store/experimentStore";

function formatSeconds(value: number | null) {
  return value === null ? "Not reached" : `${value.toFixed(2)} s`;
}

function formatOmega(value: number) {
  if (value === 0) return "0";
  if (value < 0.001 || value >= 1000) return value.toExponential(2);
  return value.toFixed(3);
}

/** Compact form of a depth-marker label for tight chart annotations. */
function shortMarker(label: string): string {
  const beforeParen = label.split("(")[0].trim();
  const base = beforeParen.length > 0 ? beforeParen : label;
  return base.length > 16 ? `${base.slice(0, 15)}…` : base;
}

type RiskTone = "ok" | "warn" | "bad";

/** At-a-glance severity, so the headline reads before any chart is expanded. */
function riskTone(summary: ResultSummary): RiskTone {
  if (summary.omegaDermalBase >= 1 || summary.omegaBasal >= 1) return "bad";
  if (summary.omegaBasal >= 0.53 || summary.peakBasalTemperatureC >= 44) return "warn";
  return "ok";
}

function Section({
  title,
  tone,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  tone?: "ok" | "warn" | "bad";
  badge?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="result-section">
      <button
        type="button"
        className="result-section__toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className={`result-section__chevron${open ? " is-open" : ""}`}>›</span>
        <span className="result-section__title">{title}</span>
        {badge && (
          <span className={`result-badge${tone ? ` is-${tone}` : ""}`}>{badge}</span>
        )}
      </button>
      {open && <div className="result-section__body">{children}</div>}
    </section>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  label?: number;
  unit: string;
  payload?: Array<{ name: string; value: number; color: string }>;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="results-tooltip">
      <strong>
        {Number(label).toFixed(2)} {unit}
      </strong>
      {payload.map((entry) => (
        <span key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {Number(entry.value).toPrecision(4)}
        </span>
      ))}
    </div>
  );
}

const AXIS = {
  tick: { fill: "#909090", fontSize: 10 },
  tickLine: false,
  axisLine: { stroke: "#4a4a4a" },
} as const;

function TimeChart({ contact }: { contact: HeatContactResult }) {
  const showDevice = contact.inputs.deviceControl !== "ideal (setpoint held)";
  const shallowLabel = shortMarker(contact.skinProfile.shallowMarkerLabel);
  const deepLabel = shortMarker(contact.skinProfile.deepMarkerLabel);

  return (
    <div className="results-chart" aria-label={`${contact.label} temperature over time`}>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={contact.series} margin={{ top: 12, right: 10, bottom: 2, left: -18 }}>
          <CartesianGrid stroke="#3d3d3d" strokeDasharray="3 3" />
          {contact.inputs.postExposureS > 0 && (
            <ReferenceArea
              x1={0}
              x2={contact.inputs.exposureS}
              fill="#20b8ed"
              fillOpacity={0.06}
            />
          )}
          <XAxis dataKey="timeS" type="number" unit=" s" {...AXIS} />
          <YAxis domain={["auto", "auto"]} unit=" °C" width={56} {...AXIS} />
          <ReferenceLine
            y={44}
            stroke="#ffb020"
            strokeDasharray="4 4"
            label={{
              value: "44 °C",
              fill: "#e5b15b",
              fontSize: 10,
              position: "insideTopRight",
            }}
          />
          <Tooltip content={<ChartTooltip unit="s" />} />
          {showDevice && (
            <Line
              name="Device"
              type="monotone"
              dataKey="deviceTemperatureC"
              stroke="#a78bfa"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              isAnimationActive={false}
            />
          )}
          <Line
            name="Skin surface"
            type="monotone"
            dataKey="surfaceTemperatureC"
            stroke="#20b8ed"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            name={shallowLabel}
            type="monotone"
            dataKey="basalTemperatureC"
            stroke="#f08c69"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            name={deepLabel}
            type="monotone"
            dataKey="dermalBaseTemperatureC"
            stroke="#8fbf6a"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="results-chart__legend">
        {showDevice && (
          <span>
            <i style={{ background: "#a78bfa" }} />
            Device
          </span>
        )}
        <span>
          <i style={{ background: "#20b8ed" }} />
          Surface
        </span>
        <span>
          <i style={{ background: "#f08c69" }} />
          {shallowLabel}
        </span>
        <span>
          <i style={{ background: "#8fbf6a" }} />
          {deepLabel}
        </span>
      </div>
      {contact.inputs.postExposureS > 0 && (
        <p className="results-chart__caption">
          Shaded region is contact; the tail is post-contact cooling.
        </p>
      )}
    </div>
  );
}

const OMEGA_FLOOR = 1e-9;

function DepthChart({ contact }: { contact: HeatContactResult }) {
  const data = useMemo(
    () =>
      contact.depthProfile.map((sample) => ({
        ...sample,
        // A log axis cannot render zeros, so clamp to a floor well below any
        // meaningful damage level.
        omegaPlot: Math.max(sample.damageOmega, OMEGA_FLOOR),
      })),
    [contact.depthProfile],
  );

  const hasDamage = contact.depthProfile.some((sample) => sample.damageOmega > OMEGA_FLOOR);

  return (
    <div className="results-chart" aria-label={`${contact.label} profile with depth`}>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 12, right: 4, bottom: 2, left: -18 }}>
          <CartesianGrid stroke="#3d3d3d" strokeDasharray="3 3" />
          <XAxis dataKey="depthMm" type="number" unit=" mm" {...AXIS} />
          <YAxis yAxisId="temp" domain={["auto", "auto"]} unit=" °C" width={56} {...AXIS} />
          {hasDamage && (
            <YAxis
              yAxisId="omega"
              orientation="right"
              scale="log"
              domain={[OMEGA_FLOOR, "auto"]}
              width={44}
              tickFormatter={(value: number) => value.toExponential(0)}
              {...AXIS}
            />
          )}
          <ReferenceLine
            yAxisId="temp"
            x={contact.summary.basalDepthMm}
            stroke="#f08c69"
            strokeDasharray="3 3"
            label={{
              value: shortMarker(contact.skinProfile.shallowMarkerLabel),
              fill: "#f08c69",
              fontSize: 9,
              position: "top",
            }}
          />
          <ReferenceLine
            yAxisId="temp"
            x={contact.summary.dermalBaseDepthMm}
            stroke="#8fbf6a"
            strokeDasharray="3 3"
            label={{
              value: shortMarker(contact.skinProfile.deepMarkerLabel),
              fill: "#8fbf6a",
              fontSize: 9,
              position: "top",
            }}
          />
          {hasDamage && (
            <ReferenceLine
              yAxisId="omega"
              y={1}
              stroke="#e5554b"
              strokeDasharray="4 4"
              label={{ value: "Ω = 1", fill: "#e5554b", fontSize: 9, position: "insideBottomRight" }}
            />
          )}
          <Tooltip content={<ChartTooltip unit="mm" />} />
          <Line
            yAxisId="temp"
            name="Peak temperature"
            type="monotone"
            dataKey="peakTemperatureC"
            stroke="#f08c69"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            yAxisId="temp"
            name="Final temperature"
            type="monotone"
            dataKey="finalTemperatureC"
            stroke="#20b8ed"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
            isAnimationActive={false}
          />
          {hasDamage && (
            <Line
              yAxisId="omega"
              name="Damage Ω"
              type="monotone"
              dataKey="omegaPlot"
              stroke="#e5554b"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
      <div className="results-chart__legend">
        <span>
          <i style={{ background: "#f08c69" }} />
          Peak
        </span>
        <span>
          <i style={{ background: "#20b8ed" }} />
          Final
        </span>
        {hasDamage && (
          <span>
            <i style={{ background: "#e5554b" }} />
            Ω (log)
          </span>
        )}
      </div>
    </div>
  );
}

function VerificationStrip({ suite }: { suite: VerificationSuite }) {
  return (
    <Section
      title="Solver verification"
      tone={suite.passed ? "ok" : "bad"}
      badge={suite.passed ? "All cases pass" : "FAILING"}
    >
      <p className="result-note">{suite.summary}</p>
      <table className="result-table">
        <thead>
          <tr>
            <th>Case</th>
            <th>Error</th>
            <th>Tolerance</th>
          </tr>
        </thead>
        <tbody>
          {suite.cases.map((entry) => (
            <tr key={entry.id}>
              <td title={`${entry.description}\n\n${entry.reference}`}>{entry.name}</td>
              <td className={entry.passed ? "is-ok" : "is-bad"}>
                {entry.error.toExponential(2)}
              </td>
              <td>{entry.tolerance.toExponential(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="result-note is-dim">{suite.scope}</p>
    </Section>
  );
}

function ConvergencePanel({ report }: { report: ConvergenceReport }) {
  return (
    <Section
      title="Mesh and timestep convergence"
      tone={report.converged ? "ok" : "warn"}
      badge={report.converged ? "Converged" : "Not converged"}
    >
      <p className="result-note">{report.note}</p>
      <table className="result-table">
        <thead>
          <tr>
            <th>Quantity</th>
            <th>Change on refinement</th>
            <th>Order</th>
          </tr>
        </thead>
        <tbody>
          {report.metrics.map((metric) => (
            <tr key={metric.name}>
              <td>{metric.name}</td>
              <td className={metric.converged ? "is-ok" : "is-bad"}>
                {(metric.relativeChange * 100).toPrecision(2)} %
              </td>
              <td>
                {metric.observedOrder === null ? "—" : metric.observedOrder.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

function ContactResult({ contact }: { contact: HeatContactResult }) {
  const [chart, setChart] = useState<"time" | "depth">("time");
  const { summary, bounds, dimensionality, energy } = contact;
  const tone = riskTone(summary);
  const toneLabel =
    tone === "bad" ? "High" : tone === "warn" ? "Elevated" : "Low";

  return (
    <article className="result-card">
      <div className="result-card__header">
        <strong>{contact.label}</strong>
        <span>{summary.riskClassification}</span>
      </div>

      <div className={`result-headline is-${tone}`}>
        <div className="result-headline__risk">
          <span className="result-headline__risk-label">Injury risk</span>
          <span className={`result-badge is-${tone}`}>{toneLabel}</span>
        </div>
        <div className="result-headline__metrics">
          <div>
            <span>Peak surface</span>
            <strong>{summary.peakSurfaceTemperatureC.toFixed(1)} °C</strong>
          </div>
          <div>
            <span>Peak {shortMarker(contact.skinProfile.shallowMarkerLabel)}</span>
            <strong>{summary.peakBasalTemperatureC.toFixed(1)} °C</strong>
          </div>
          <div>
            <span>Time to 44 °C</span>
            <strong>{formatSeconds(summary.timeTo44cS)}</strong>
          </div>
          <div>
            <span>Damage Ω</span>
            <strong>{formatOmega(summary.omegaBasal)}</strong>
          </div>
        </div>
      </div>

      <div className="results-chart-tabs">
        <button
          type="button"
          className={`results-chart-tab${chart === "time" ? " is-active" : ""}`}
          onClick={() => setChart("time")}
        >
          Over time
        </button>
        <button
          type="button"
          className={`results-chart-tab${chart === "depth" ? " is-active" : ""}`}
          onClick={() => setChart("depth")}
        >
          With depth
        </button>
      </div>

      {chart === "time" ? <TimeChart contact={contact} /> : <DepthChart contact={contact} />}

      <dl className="result-card__grid">
        <div>
          <dt>Device setpoint</dt>
          <dd>{contact.inputs.deviceSetpointC.toFixed(1)} °C</dd>
        </div>
        <div>
          <dt>Peak skin surface</dt>
          <dd>{summary.peakSurfaceTemperatureC.toFixed(2)} °C</dd>
        </div>
        <div>
          <dt>
            Peak {contact.skinProfile.shallowMarkerLabel} (
            {summary.basalDepthMm.toFixed(3)} mm)
          </dt>
          <dd>{summary.peakBasalTemperatureC.toFixed(2)} °C</dd>
        </div>
        <div>
          <dt>
            Peak {contact.skinProfile.deepMarkerLabel} (
            {summary.dermalBaseDepthMm.toFixed(3)} mm)
          </dt>
          <dd>{summary.peakDermalBaseTemperatureC.toFixed(2)} °C</dd>
        </div>
        <div>
          <dt>Time to 44 °C at {shortMarker(contact.skinProfile.shallowMarkerLabel)}</dt>
          <dd>{formatSeconds(summary.timeTo44cS)}</dd>
        </div>
        <div>
          <dt>Damage Ω at {shortMarker(contact.skinProfile.shallowMarkerLabel)}</dt>
          <dd>{formatOmega(summary.omegaBasal)}</dd>
        </div>
        <div>
          <dt>Damage depth (Ω = 1)</dt>
          <dd>
            {summary.damageDepthMm === null
              ? "None"
              : `${summary.damageDepthMm.toFixed(3)} mm`}
          </dd>
        </div>
        <div>
          <dt>Contact conductance</dt>
          <dd>{contact.inputs.contactConductanceWPerM2K.toPrecision(4)} W/m²K</dd>
        </div>
        <div>
          <dt>Energy delivered</dt>
          <dd>{summary.totalEnergyDeliveredJ.toPrecision(4)} J</dd>
        </div>
        <div>
          <dt>Peak surface flux</dt>
          <dd>{summary.peakSurfaceFluxWPerM2.toPrecision(4)} W/m²</dd>
        </div>
      </dl>

      <div className="result-bounds">
        <div className="result-bounds__title">
          Peak basal temperature, with uncertainty
        </div>
        <div className="result-bounds__value">
          {bounds.nominalPeakBasalC.toFixed(2)} °C
          <span>
            {" "}
            ({bounds.sensitivityLowPeakBasalC.toFixed(2)} –{" "}
            {bounds.sensitivityHighPeakBasalC.toFixed(2)} °C across tissue-property ranges)
          </span>
        </div>
        <div className="result-bounds__row">
          <span>Lateral-spreading bound</span>
          <code>
            {bounds.lateralBoundPeakBasalC.toFixed(2)} °C · Ω{" "}
            {formatOmega(bounds.lateralBoundOmega)}
          </code>
        </div>
        <p className="result-note is-dim">{bounds.note}</p>
      </div>

      <Section
        title="1D validity"
        tone={
          dimensionality.verdict === "1D assumption well satisfied"
            ? "ok"
            : dimensionality.verdict === "1D assumption marginal"
              ? "warn"
              : "bad"
        }
        badge={dimensionality.verdict.replace("1D assumption ", "")}
      >
        <dl className="result-card__grid">
          <div>
            <dt>Contact radius</dt>
            <dd>{dimensionality.contactRadiusMm.toPrecision(3)} mm</dd>
          </div>
          <div>
            <dt>Penetration depth</dt>
            <dd>{dimensionality.penetrationDepthMm.toPrecision(3)} mm</dd>
          </div>
          <div>
            <dt>Fourier number</dt>
            <dd>{dimensionality.fourierNumber.toPrecision(3)}</dd>
          </div>
          <div>
            <dt>Retained rise</dt>
            <dd>{(dimensionality.spreadingFactor * 100).toFixed(1)} %</dd>
          </div>
        </dl>
        <p className="result-note">{dimensionality.guidance}</p>
      </Section>

      {contact.convergence && <ConvergencePanel report={contact.convergence} />}

      <Section
        title="Energy balance"
        tone={energy.balanced ? "ok" : "bad"}
        badge={energy.balanced ? "Closed" : "Unbalanced"}
      >
        <dl className="result-card__grid">
          <div>
            <dt>In at surface</dt>
            <dd>{energy.surfaceInJPerM2.toPrecision(4)} J/m²</dd>
          </div>
          <div>
            <dt>Stored in tissue</dt>
            <dd>{energy.storedJPerM2.toPrecision(4)} J/m²</dd>
          </div>
          <div>
            <dt>Removed by perfusion</dt>
            <dd>{energy.perfusionOutJPerM2.toPrecision(4)} J/m²</dd>
          </div>
          <div>
            <dt>Out at deep boundary</dt>
            <dd>{energy.coreOutJPerM2.toPrecision(4)} J/m²</dd>
          </div>
          <div>
            <dt>Metabolic input</dt>
            <dd>{energy.metabolicInJPerM2.toPrecision(4)} J/m²</dd>
          </div>
          <div>
            <dt>Relative residual</dt>
            <dd>{energy.relativeResidual.toExponential(2)}</dd>
          </div>
        </dl>
      </Section>

      {contact.sensitivity.length > 0 && (
        <Section title="Sensitivity" badge={`${contact.sensitivity.length} parameters`}>
          <p className="result-note">
            Each row varies one property across its tabulated range with everything
            else held fixed. Rows are ordered by how much they move the answer.
          </p>
          <table className="result-table">
            <thead>
              <tr>
                <th>Parameter</th>
                <th>Range</th>
                <th>Peak basal span</th>
              </tr>
            </thead>
            <tbody>
              {contact.sensitivity.slice(0, 8).map((entry) => (
                <tr key={entry.parameter}>
                  <td>{entry.parameter}</td>
                  <td>
                    {entry.low.toPrecision(3)} – {entry.high.toPrecision(3)} {entry.unit}
                  </td>
                  <td>{entry.peakBasalSpanC.toFixed(2)} °C</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {contact.warnings.length > 0 && (
        <Section
          title="Caveats"
          tone="warn"
          badge={String(contact.warnings.length)}
          defaultOpen
        >
          <ul className="result-warnings">
            {contact.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Inputs and provenance">
        <div className="result-provenance">
          <div>
            <strong>{contact.skinProfile.label}</strong>
            <span>{contact.skinProfile.description}</span>
          </div>
          <table className="result-table">
            <thead>
              <tr>
                <th>Layer</th>
                <th>Thickness</th>
                <th>k</th>
                <th>Perfusion</th>
              </tr>
            </thead>
            <tbody>
              {contact.skinProfile.layers.map((layer) => (
                <tr key={layer.name}>
                  <td title={layer.thicknessM.source}>{layer.name}</td>
                  <td>{(layer.thicknessM.value * 1000).toPrecision(3)} mm</td>
                  <td>{layer.conductivityWPerMK.value.toPrecision(3)}</td>
                  <td>{layer.perfusionPerS.value.toPrecision(2)} /s</td>
                </tr>
              ))}
            </tbody>
          </table>

          <dl className="result-card__grid">
            <div>
              <dt>Interface</dt>
              <dd>{contact.interfaceMaterial.label}</dd>
            </div>
            <div>
              <dt>Device</dt>
              <dd>{contact.deviceMaterial.label}</dd>
            </div>
            <div>
              <dt>Control</dt>
              <dd>{contact.inputs.deviceControl}</dd>
            </div>
            <div>
              <dt>Contact method</dt>
              <dd>{contact.contact.method}</dd>
            </div>
            <div>
              <dt>Mesh</dt>
              <dd>
                {contact.solver.cellCount} cells to{" "}
                {contact.solver.domainDepthMm.toFixed(1)} mm
              </dd>
            </div>
            <div>
              <dt>Steps</dt>
              <dd>{contact.solver.stepCount.toLocaleString()}</dd>
            </div>
          </dl>

          <p className="result-note is-dim">{contact.solver.scheme}</p>
          <p className="result-note is-dim">{contact.damageModel.citation}</p>
          {contact.skinProfile.citations.map((citation) => (
            <p key={citation} className="result-note is-dim">
              {citation}
            </p>
          ))}
        </div>
      </Section>
    </article>
  );
}

export function ResultsPanel() {
  const result = useExperimentStore((s) => s.simulationResult);
  const status = useExperimentStore((s) => s.simulationStatus);
  const error = useExperimentStore((s) => s.simulationError);
  const run = useExperimentStore((s) => s.runSimulation);
  const clear = useExperimentStore((s) => s.clearSimulation);
  const contacts = useExperimentStore((s) => s.contactPoints);
  const solverPreset = useExperimentStore((s) => s.solverPreset);
  const setSolverPreset = useExperimentStore((s) => s.setSolverPreset);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!result) {
      setSelectedId(null);
      return;
    }

    setSelectedId((current) =>
      result.contacts.some((contact) => contact.contactPointId === current)
        ? current
        : (result.contacts[0]?.contactPointId ?? null),
    );
  }, [result]);

  const selected = useMemo(
    () =>
      result?.contacts.find((contact) => contact.contactPointId === selectedId) ??
      result?.contacts[0] ??
      null,
    [result, selectedId],
  );

  return (
    <div className="results-panel">
      <label className="stimulus-form__field">
        <span className="stimulus-form__label">Accuracy</span>
        <select
          className="stimulus-form__select"
          value={solverPreset}
          onChange={(event) => setSolverPreset(event.target.value as SolverPresetId)}
        >
          {Object.entries(SOLVER_PRESETS).map(([id, preset]) => (
            <option key={id} value={id}>
              {preset.label}
            </option>
          ))}
        </select>
        <span className="stimulus-form__help">
          {SOLVER_PRESETS[solverPreset].description}
        </span>
      </label>

      <div className="sidebar__actions">
        <button
          type="button"
          className="sidebar__btn sidebar__btn--primary"
          disabled={status === "running" || contacts.length === 0}
          onClick={() => void run()}
        >
          {status === "running" ? "Running heat model…" : "Run heat simulation"}
        </button>
        {result && (
          <button type="button" className="sidebar__btn" onClick={clear}>
            Clear run
          </button>
        )}
      </div>

      {error && (
        <div className="sidebar__error" role="alert">
          {error}
        </div>
      )}

      {!result && status !== "running" && !error && (
        <div className="sidebar__empty">
          <div className="sidebar__empty-title">No simulation results</div>
          <p className="sidebar__empty-copy">
            Run the heat model for your assigned Heat contacts. Cold, electrical
            and pressure models are not implemented.
          </p>
        </div>
      )}

      {status === "running" && (
        <div className="results-panel__running">
          Solving the layered tissue response, then refining the mesh to check
          the answer does not depend on it…
        </div>
      )}

      {result && (
        <>
          <div className="results-panel__toolbar">
            <span className="results-panel__run-label">
              {result.contacts.length} heat contact
              {result.contacts.length === 1 ? "" : "s"} ·{" "}
              {new Date(result.manifest.generatedAtUnixMs).toLocaleTimeString()}
            </span>
          </div>

          <div className="results-panel__exports">
            <button
              type="button"
              className="results-panel__export"
              onClick={() => exportTimeSeriesCsv(result)}
            >
              Time series CSV
            </button>
            <button
              type="button"
              className="results-panel__export"
              onClick={() => exportDepthProfileCsv(result)}
            >
              Depth CSV
            </button>
            <button
              type="button"
              className="results-panel__export"
              onClick={() => exportRunManifest(result)}
            >
              Manifest JSON
            </button>
          </div>

          <div className="results-panel__notice">
            <strong>Research prototype</strong>
            <span>{result.model.validationStatus}</span>
          </div>

          <VerificationStrip suite={result.manifest.verification} />

          {result.contacts.length > 1 && (
            <div
              className="results-contact-tabs"
              role="tablist"
              aria-label="Heat contact results"
            >
              {result.contacts.map((contact) => (
                <button
                  type="button"
                  key={contact.contactPointId}
                  role="tab"
                  aria-selected={selected?.contactPointId === contact.contactPointId}
                  className={`results-contact-tab${
                    selected?.contactPointId === contact.contactPointId ? " is-active" : ""
                  }`}
                  onClick={() => setSelectedId(contact.contactPointId)}
                >
                  {contact.label}
                </button>
              ))}
            </div>
          )}

          {selected && <ContactResult contact={selected} />}

          {result.unsupportedContacts.length > 0 && (
            <div className="results-panel__unsupported">
              {result.unsupportedContacts.map((contact) => (
                <div key={contact.contactPointId}>
                  {contact.label} ({contact.stimulusType}): {contact.reason}
                </div>
              ))}
            </div>
          )}

          <div className="results-panel__citation">
            <strong>Model</strong>
            <span>
              {result.model.name} · {result.model.version}
            </span>
            {result.model.governingEquations.map((equation) => (
              <code key={equation}>{equation}</code>
            ))}
            <span>{result.model.disclaimer}</span>
          </div>
        </>
      )}
    </div>
  );
}
