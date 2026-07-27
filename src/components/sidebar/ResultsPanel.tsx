import { useEffect, useMemo, useState } from "react";
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
  runSimulation as runHeatSimulation,
  SOLVER_PRESETS,
  type HeatContactResult,
} from "../../lib/simulation";
import {
  injuryRiskFromOmega,
} from "../../lib/verdict";
import {
  heatComparisonAnchor,
  heatSafetyBudget,
  heatSynthesis,
  heatTemperatureMargin,
} from "../../lib/resultMetrics";
import { detectFailModes } from "../../lib/failModes";
import { useExperimentStore } from "../../store/experimentStore";
import {
  bandsFromDepthProfile,
  LayeredCrossSection,
} from "../results/LayeredCrossSection";
import { PhaseStrip } from "../results/PhaseStrip";
import {
  DeepDive,
  SafetyBudgetBar,
  StoryMetric,
  StoryMetrics,
} from "../results/ResultsTier";
import { SensitivityTornado } from "../results/SensitivityTornado";
import { MechanicsPanel } from "./MechanicsPanel";
import { ElectricalPanel } from "./ElectricalPanel";

function formatSeconds(value: number | null) {
  return value === null ? "Not reached" : `${value.toFixed(2)} s`;
}

function formatOmega(value: number) {
  if (value === 0) return "0";
  if (value < 0.001 || value >= 1000) return value.toExponential(2);
  return value.toFixed(3);
}

function shortMarker(label: string): string {
  const beforeParen = label.split("(")[0].trim();
  const base = beforeParen.length > 0 ? beforeParen : label;
  return base.length > 16 ? `${base.slice(0, 15)}…` : base;
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
      <ResponsiveContainer width="100%" height={260}>
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
      <PhaseStrip samples={contact.series} insetLeftPx={38} insetRightPx={10} />
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

function DamageChart({ contact }: { contact: HeatContactResult }) {
  const data = useMemo(
    () =>
      contact.series.map((sample) => ({
        timeS: sample.timeS,
        damageOmega: Math.max(sample.damageOmega, 0),
        omegaPlot: Math.max(sample.damageOmega, OMEGA_FLOOR),
      })),
    [contact.series],
  );

  const peakOmega = Math.max(...data.map((d) => d.damageOmega), 0);
  const useLog = peakOmega > 0 && peakOmega < 0.05;

  return (
    <div className="results-chart" aria-label={`${contact.label} damage accumulation over time`}>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 12, right: 10, bottom: 2, left: -8 }}>
          <CartesianGrid stroke="#3d3d3d" strokeDasharray="3 3" />
          {contact.inputs.postExposureS > 0 && (
            <ReferenceArea
              x1={0}
              x2={contact.inputs.exposureS}
              fill="#e5554b"
              fillOpacity={0.05}
            />
          )}
          <XAxis dataKey="timeS" type="number" unit=" s" {...AXIS} />
          <YAxis
            domain={useLog ? [OMEGA_FLOOR, "auto"] : [0, Math.max(1.05, peakOmega * 1.15)]}
            scale={useLog ? "log" : "auto"}
            width={64}
            tickFormatter={(value: number) =>
              value >= 0.01 || value === 0 ? value.toFixed(2) : value.toExponential(0)
            }
            {...AXIS}
          />
          <ReferenceLine
            y={1}
            stroke="#e5554b"
            strokeDasharray="4 4"
            label={{
              value: "Ω = 1 · irreversible injury threshold",
              fill: "#f0a8a3",
              fontSize: 10,
              position: "insideTopRight",
            }}
          />
          <Tooltip content={<ChartTooltip unit="s" />} />
          <Line
            name="Damage Ω (basal)"
            type="monotone"
            dataKey={useLog ? "omegaPlot" : "damageOmega"}
            stroke="#e5554b"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="results-chart__legend">
        <span>
          <i style={{ background: "#e5554b" }} />
          Damage Ω (basal layer)
        </span>
      </div>
      <p className="results-chart__caption">
        Henriques damage integral accumulates during contact and while skin cools afterward.
        Ω = 1.0 is the irreversible-injury threshold.
      </p>
    </div>
  );
}

function PerfusionChart({ contact }: { contact: HeatContactResult }) {
  const peakFold = Math.max(...contact.series.map((sample) => sample.perfusionFold), 1);
  const staticPerfusion = contact.inputs.perfusionModel === "Static";

  return (
    <div className="results-chart" aria-label={`${contact.label} blood-flow response over time`}>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={contact.series} margin={{ top: 12, right: 10, bottom: 2, left: -8 }}>
          <CartesianGrid stroke="#3d3d3d" strokeDasharray="3 3" />
          {contact.inputs.postExposureS > 0 && (
            <ReferenceArea
              x1={0}
              x2={contact.inputs.exposureS}
              fill="#4fbf86"
              fillOpacity={0.06}
            />
          )}
          <XAxis dataKey="timeS" type="number" unit=" s" {...AXIS} />
          <YAxis domain={[0, Math.max(1.2, peakFold * 1.12)]} unit="×" width={52} {...AXIS} />
          <ReferenceLine
            y={1}
            stroke="#777"
            strokeDasharray="4 4"
            label={{ value: "baseline", fill: "#aaa", fontSize: 10, position: "insideTopRight" }}
          />
          <Tooltip content={<ChartTooltip unit="s" />} />
          <Line
            name="Blood flow"
            type="monotone"
            dataKey="perfusionFold"
            stroke="#4fbf86"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="results-chart__legend">
        <span>
          <i style={{ background: "#4fbf86" }} />
          Perfusion at basal layer
        </span>
      </div>
      <p className="results-chart__caption">
        {staticPerfusion
          ? "Static perfusion holds blood flow at its baseline value."
          : `Local heating raised basal-layer blood flow to ${peakFold.toFixed(1)}× baseline, increasing heat removal during the hold.`}
      </p>
    </div>
  );
}

function ControllerChart({ contact }: { contact: HeatContactResult }) {
  const peakFlux = Math.max(
    ...contact.series.map((sample) => sample.controllerFluxWPerM2),
    1,
  );
  const saturated = contact.series.some((sample) => sample.controllerSaturated);

  return (
    <div className="results-chart" aria-label={`${contact.label} controller power over time`}>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={contact.series} margin={{ top: 12, right: 10, bottom: 2, left: -8 }}>
          <CartesianGrid stroke="#3d3d3d" strokeDasharray="3 3" />
          <XAxis dataKey="timeS" type="number" unit=" s" {...AXIS} />
          <YAxis domain={[0, peakFlux * 1.12]} unit=" W/m²" width={70} {...AXIS} />
          <Tooltip content={<ChartTooltip unit="s" />} />
          <Line
            name="Delivered controller flux"
            type="stepAfter"
            dataKey="controllerFluxWPerM2"
            stroke="#d5a55e"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <p className="results-chart__caption">
        {saturated
          ? "The controller reached its configured power ceiling. Device temperature and tissue heating are lower than an ideal setpoint-held device."
          : "Delivered controller power stayed below the configured limit."}
      </p>
    </div>
  );
}

function DepthChart({ contact }: { contact: HeatContactResult }) {
  const data = useMemo(
    () =>
      contact.depthProfile.map((sample) => ({
        ...sample,
        omegaPlot: Math.max(sample.damageOmega, OMEGA_FLOOR),
      })),
    [contact.depthProfile],
  );

  const hasDamage = contact.depthProfile.some((sample) => sample.damageOmega > OMEGA_FLOOR);

  return (
    <div className="results-chart" aria-label={`${contact.label} depth profile at peak`}>
      <ResponsiveContainer width="100%" height={260}>
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
      <p className="results-chart__caption">
        Peak temperatures across depth during the run; final is end-of-simulation.
      </p>
    </div>
  );
}

function VerdictCard({ contact }: { contact: HeatContactResult }) {
  const { summary } = contact;
  const { level, tone } = injuryRiskFromOmega(summary.omegaBasal, summary.omegaDermalBase);
  const comfortTone =
    summary.comfortClassification === "Painful"
      ? "exceeded"
      : summary.comfortClassification === "Uncomfortable"
        ? "high"
        : summary.comfortClassification === "Warm"
          ? "moderate"
          : "none";

  return (
    <section className={`verdict-card results-verdict is-${tone}`} aria-live="polite">
      <div className="result-tier-label">Verdict</div>
      <div className="verdict-card__top">
        <div className="verdict-card__identity">
          <strong>{contact.label}</strong>
          <span>{contact.skinProfile.label}</span>
        </div>
        <div className="verdict-card__badges">
          <div className={`verdict-card__badge is-${tone}`}>
            <span className="verdict-card__badge-label">Injury risk</span>
            <span className="verdict-card__badge-value">{level}</span>
            <span className="verdict-card__badge-threshold">Ω threshold = 1.0</span>
          </div>
          <div className={`verdict-card__badge is-${comfortTone}`}>
            <span className="verdict-card__badge-label">Thermal comfort</span>
            <span className="verdict-card__badge-value">
              {summary.comfortClassification}
            </span>
            <span className="verdict-card__badge-threshold">
              nociceptor onset ≈ 43–45 °C
            </span>
          </div>
        </div>
      </div>

      <p className="verdict-card__sentence">{heatSynthesis(contact)}</p>
      <SafetyBudgetBar budget={heatSafetyBudget(summary)} />
      {summary.thermalDoseDisagreement && (
        <div className="verdict-card__caveat">
          Thermal-dose metrics disagree: Ω and the {summary.cem43ReferenceMinutes.toFixed(0)}
          -minute CEM43 reference do not flag the same outcome. CEM43 thresholds are
          tissue- and protocol-dependent; inspect both metrics rather than treating either
          as definitive.
        </div>
      )}
    </section>
  );
}

function HeatStory({ contact }: { contact: HeatContactResult }) {
  const { summary } = contact;
  const margin = heatTemperatureMargin(summary);
  const anchor = heatComparisonAnchor(summary.peakSurfaceTemperatureC);
  const cem43 =
    summary.cem43BasalMinutes < 0.01
      ? summary.cem43BasalMinutes.toExponential(2)
      : summary.cem43BasalMinutes.toFixed(2);

  return (
    <StoryMetrics>
      <StoryMetric
        primary
        label="Peak basal temperature"
        value={summary.peakBasalTemperatureC.toFixed(1)}
        unit="°C"
      />
      <StoryMetric
        label="Margin to 44 °C"
        value={`${margin.marginC >= 0 ? "+" : "−"}${Math.abs(margin.marginC).toFixed(1)}`}
        unit="°C"
        note={`${Math.abs(margin.marginPercent).toFixed(1)}% ${margin.marginC >= 0 ? "remaining" : "over"}`}
      />
      <StoryMetric label="Time to 44 °C" value={formatSeconds(summary.timeTo44cS)} />
      <StoryMetric label="Damage Ω" value={formatOmega(summary.omegaBasal)} note="threshold 1.0" />
      <StoryMetric label="CEM43 dose" value={cem43} unit="min" note="reference 240 min" />
      <StoryMetric
        label="Peak surface"
        value={summary.peakSurfaceTemperatureC.toFixed(1)}
        unit="°C"
        note={`similar to ${anchor}`}
      />
    </StoryMetrics>
  );
}

function HeatLayerSlab({ contact }: { contact: HeatContactResult }) {
  const bands = useMemo(
    () => bandsFromDepthProfile(contact.depthProfile),
    [contact.depthProfile],
  );
  if (bands.length === 0) return null;

  const values = bands.map((band) => band.value);
  const min = Math.min(...values);
  const max = Math.max(...values, 44);

  return (
    <LayeredCrossSection
      title="Layers by peak temperature"
      bands={bands}
      unit="°C"
      colorScale={{
        min,
        max,
        stops: ["#2a2a2a", "#046a9a", "#0696d7", "#e3b341", "#e5534b"],
      }}
      valueFormatter={(value) => value.toFixed(1)}
    />
  );
}

function PhysicsDetail({ contact }: { contact: HeatContactResult }) {
  const { summary, bounds, energy, dimensionality, convergence, sensitivity } = contact;

  return (
    <section className="physics-detail deep-dive__section">
      <div className="physics-detail__header">
        <strong>Thermal model</strong>
        <span>summary · energy · uncertainty · validity</span>
      </div>
      <div className="physics-detail__body">
          <dl className="result-card__grid">
            <div>
              <dt>Peak deep</dt>
              <dd>{summary.peakDermalBaseTemperatureC.toFixed(2)} °C</dd>
            </div>
            <div>
              <dt>Damage Ω · deep marker</dt>
              <dd>{formatOmega(summary.omegaDermalBase)}</dd>
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
              <dt>Reporting depths</dt>
              <dd>{summary.basalDepthMm.toFixed(3)} / {summary.dermalBaseDepthMm.toFixed(3)} mm</dd>
            </div>
            <div>
              <dt>Contact conductance</dt>
              <dd>{contact.inputs.contactConductanceWPerM2K.toPrecision(4)} W/m²K</dd>
            </div>
            <div>
              <dt>Peak surface flux</dt>
              <dd>{summary.peakSurfaceFluxWPerM2.toPrecision(4)} W/m²</dd>
            </div>
            <div>
              <dt>Energy delivered</dt>
              <dd>{summary.totalEnergyDeliveredJ.toPrecision(4)} J</dd>
            </div>
            <div>
              <dt>Final surface / device</dt>
              <dd>{summary.finalSurfaceTemperatureC.toFixed(2)} / {summary.finalDeviceTemperatureC.toFixed(2)} °C</dd>
            </div>
            <div>
              <dt>Device setpoint</dt>
              <dd>{contact.inputs.deviceSetpointC.toFixed(1)} °C</dd>
            </div>
          </dl>
          <div className="result-bounds">
            <div className="result-bounds__title">Peak basal · uncertainty</div>
            <div className="result-bounds__value">
              {bounds.nominalPeakBasalC.toFixed(2)} °C
              <span>
                {" "}
                ({bounds.sensitivityLowPeakBasalC.toFixed(2)} –{" "}
                {bounds.sensitivityHighPeakBasalC.toFixed(2)} °C across tissue-property ranges)
              </span>
            </div>
            <p className="result-note is-dim">{bounds.note}</p>
            <div className="result-bounds__row">
              <span>Lateral spreading bound</span>
              <code>{bounds.lateralBoundPeakBasalC.toFixed(2)} °C · Ω {formatOmega(bounds.lateralBoundOmega)}</code>
            </div>
          </div>

          <div className="deep-metric-group">
            <strong>Energy balance</strong>
            <dl className="result-card__grid">
              <div><dt>Surface input</dt><dd>{energy.surfaceInJPerM2.toPrecision(4)} J/m²</dd></div>
              <div><dt>Stored</dt><dd>{energy.storedJPerM2.toPrecision(4)} J/m²</dd></div>
              <div><dt>Perfusion removal</dt><dd>{energy.perfusionOutJPerM2.toPrecision(4)} J/m²</dd></div>
              <div><dt>Deep boundary</dt><dd>{energy.coreOutJPerM2.toPrecision(4)} J/m²</dd></div>
              <div><dt>Metabolic input</dt><dd>{energy.metabolicInJPerM2.toPrecision(4)} J/m²</dd></div>
              <div><dt>Residual</dt><dd>{energy.residualJPerM2.toPrecision(4)} J/m² · {(energy.relativeResidual * 100).toExponential(2)}%</dd></div>
            </dl>
          </div>

          <div className="deep-metric-group">
            <strong>Dimensionality</strong>
            <dl className="result-card__grid">
              <div><dt>1D validity</dt><dd>{dimensionality.verdict}</dd></div>
              <div><dt>Fourier number</dt><dd>{dimensionality.fourierNumber.toPrecision(4)}</dd></div>
              <div><dt>Penetration depth</dt><dd>{dimensionality.penetrationDepthMm.toFixed(3)} mm</dd></div>
              <div><dt>Retained rise</dt><dd>{(dimensionality.spreadingFactor * 100).toFixed(1)}%</dd></div>
            </dl>
            <p className="result-note is-dim">{dimensionality.guidance}</p>
          </div>

          <div className="deep-metric-group">
            <strong>Contact network</strong>
            <dl className="result-card__grid">
              <div><dt>Total</dt><dd>{contact.contact.totalWPerM2K.toPrecision(4)} W/m²K</dd></div>
              <div><dt>Film</dt><dd>{contact.contact.interfaceFilmWPerM2K?.toPrecision(4) ?? "—"} W/m²K</dd></div>
              <div><dt>Solid spot</dt><dd>{contact.contact.solidSpotWPerM2K?.toPrecision(4) ?? "—"} W/m²K</dd></div>
              <div><dt>Gap</dt><dd>{contact.contact.gapWPerM2K?.toPrecision(4) ?? "—"} W/m²K</dd></div>
            </dl>
            <p className="result-note is-dim">{contact.contact.method}</p>
          </div>

          {convergence && (
            <div className="deep-metric-group">
              <strong>Convergence</strong>
              <table className="result-table">
                <thead><tr><th>Metric</th><th>Change</th><th>Observed order</th><th>Status</th></tr></thead>
                <tbody>
                  {convergence.metrics.map((metric) => (
                    <tr key={metric.name}>
                      <td>{metric.name}</td>
                      <td>{(metric.relativeChange * 100).toFixed(3)}%</td>
                      <td>{metric.observedOrder?.toFixed(2) ?? "—"}</td>
                      <td className={metric.converged ? "is-ok" : "is-bad"}>{metric.converged ? "Converged" : "Review"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {sensitivity.length > 0 && (
            <div className="deep-metric-group">
              <strong>Parameter sensitivity</strong>
              <SensitivityTornado sensitivity={sensitivity} />
            </div>
          )}
      </div>
    </section>
  );
}

function ContactResult({ contact }: { contact: HeatContactResult }) {
  const assignment = useExperimentStore((state) =>
    state.assignments.find((entry) => entry.contactPointId === contact.contactPointId),
  );
  const contactPoint = useExperimentStore((state) =>
    state.contactPoints.find((entry) => entry.id === contact.contactPointId),
  );
  const [chart, setChart] = useState<
    "damage" | "perfusion" | "controller" | "depth"
  >("damage");
  const failModes = useMemo(
    () => detectFailModes(contact, assignment, contactPoint),
    [assignment, contact, contactPoint],
  );
  const hasFiniteController = contact.series.some(
    (sample) => sample.controllerFluxWPerM2 > 0 || sample.controllerSaturated,
  );

  return (
    <article className="result-story">
      <VerdictCard contact={contact} />
      <HeatStory contact={contact} />
      <HeatLayerSlab contact={contact} />
      <section className="primary-result-chart" aria-label="Primary thermal response">
        <div className="result-tier-label">Response over time</div>
        <TimeChart contact={contact} />
      </section>
      <DeepDive hint="damage · blood flow · depth profile · diagnostics · run checks">
        <section className="result-story__charts">
        <div className="results-chart-tabs">
          <button
            type="button"
            className={`results-chart-tab${chart === "damage" ? " is-active" : ""}`}
            onClick={() => setChart("damage")}
          >
            Damage accumulation
          </button>
          <button
            type="button"
            className={`results-chart-tab${chart === "perfusion" ? " is-active" : ""}`}
            onClick={() => setChart("perfusion")}
          >
            Blood flow
          </button>
          {hasFiniteController && (
            <button
              type="button"
              className={`results-chart-tab${chart === "controller" ? " is-active" : ""}`}
              onClick={() => setChart("controller")}
            >
              Controller power
            </button>
          )}
          <button
            type="button"
            className={`results-chart-tab${chart === "depth" ? " is-active" : ""}`}
            onClick={() => setChart("depth")}
          >
            Depth profile (at peak)
          </button>
        </div>
        {chart === "damage" && <DamageChart contact={contact} />}
        {chart === "perfusion" && <PerfusionChart contact={contact} />}
        {chart === "controller" && hasFiniteController && <ControllerChart contact={contact} />}
        {chart === "depth" && <DepthChart contact={contact} />}
        </section>

        {failModes.length > 0 && (
          <section className="physics-detail result-fail-modes">
            <div className="physics-detail__header">
              <strong>Run checks</strong>
              <span>{failModes.length} assumption{failModes.length === 1 ? "" : "s"} to review</span>
            </div>
            <ul className="result-warnings">
              {failModes.map((mode) => (
                <li key={mode.id} className={`result-fail-modes__item is-${mode.severity}`}>
                  <strong>{mode.title}</strong> — {mode.detail}
                </li>
              ))}
            </ul>
          </section>
        )}

        <PhysicsDetail contact={contact} />
      </DeepDive>
    </article>
  );
}

function ProofLabRunStatus() {
  const status = useExperimentStore((state) => state.proofLabStatus);
  const error = useExperimentStore((state) => state.proofLabError);
  const result = useExperimentStore((state) => state.proofLabResult);
  const selectedCases = useExperimentStore((state) => state.proofLabSelectedCaseIds.length);
  const setTab = useExperimentStore((state) => state.setBottomPanelTab);
  const setExpanded = useExperimentStore((state) => state.setBottomPanelExpanded);

  if (selectedCases === 0) return null;

  const completedCases = result?.cases.length ?? 0;
  const message =
    status === "running"
      ? "Comparing this run with selected published protocols…"
      : status === "complete"
        ? `${completedCases} selected ${completedCases === 1 ? "study" : "studies"} compared`
        : status === "error"
          ? error ?? "Proof Lab comparison could not be completed."
          : "Comparison will start after the thermal run finishes.";

  return (
    <section className={`proof-lab-run-status is-${status}`}>
      <div>
        <strong>Proof Lab</strong>
        <span>{message}</span>
      </div>
      <button
        type="button"
        onClick={() => {
          setTab("proof-lab");
          setExpanded(true);
        }}
      >
        Open comparison
      </button>
    </section>
  );
}

function MultiContactComparison({
  contacts,
  selectedId,
  onSelect,
}: {
  contacts: HeatContactResult[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const ranked = [...contacts].sort(
    (a, b) =>
      b.summary.omegaBasal - a.summary.omegaBasal ||
      b.summary.peakBasalTemperatureC - a.summary.peakBasalTemperatureC,
  );

  return (
    <section className="contact-comparison">
      <div className="contact-comparison__header">
        <strong>Contact comparison</strong>
        <span>Ranked by damage Ω, then peak basal temperature</span>
      </div>
      <div className="contact-comparison__grid">
        {ranked.map((contact, index) => {
          const risk = injuryRiskFromOmega(
            contact.summary.omegaBasal,
            contact.summary.omegaDermalBase,
          );
          return (
            <button
              key={contact.contactPointId}
              type="button"
              className={`contact-comparison__item is-${risk.tone}${
                selectedId === contact.contactPointId ? " is-selected" : ""
              }`}
              onClick={() => onSelect(contact.contactPointId)}
            >
              <span className="contact-comparison__rank">#{index + 1}</span>
              <span className="contact-comparison__name">{contact.label}</span>
              <span>{risk.level}</span>
              <code>{contact.summary.peakBasalTemperatureC.toFixed(1)} °C</code>
              <code>Ω {formatOmega(contact.summary.omegaBasal)}</code>
              <code>{formatSeconds(contact.summary.timeTo44cS)}</code>
            </button>
          );
        })}
      </div>
    </section>
  );
}

type SweepPoint = {
  value: number;
  peakBasalC: number;
  omega: number;
  timeToThresholdS: number | null;
};

const SWEEP_PARAMETERS = {
  temperatureC: { label: "Device temperature", unit: "°C", min: 20, max: 150 },
  durationS: { label: "Contact duration", unit: "s", min: 0.1, max: 3600 },
  contactAreaMm2: { label: "Contact area", unit: "mm²", min: 1, max: 50000 },
} as const;

function ParameterSweepTool({ contactId }: { contactId: string }) {
  const contact = useExperimentStore((state) =>
    state.contactPoints.find((entry) => entry.id === contactId),
  );
  const assignment = useExperimentStore((state) =>
    state.assignments.find((entry) => entry.contactPointId === contactId),
  );
  const solverPreset = useExperimentStore((state) => state.solverPreset);
  const [open, setOpen] = useState(false);
  const [parameter, setParameter] =
    useState<keyof typeof SWEEP_PARAMETERS>("temperatureC");
  const current = assignment?.parameters[parameter] ?? 1;
  const [range, setRange] = useState({ min: current * 0.8, max: current * 1.2, points: 7 });
  const [metric, setMetric] = useState<"peakBasalC" | "omega" | "timeToThresholdS">(
    "peakBasalC",
  );
  const [data, setData] = useState<SweepPoint[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const next = assignment?.parameters[parameter] ?? 1;
    const bounds = SWEEP_PARAMETERS[parameter];
    setRange({
      min: Math.max(bounds.min, next * 0.8),
      max: Math.min(bounds.max, next * 1.2),
      points: 7,
    });
    setData([]);
  }, [assignment, parameter]);

  const runSweep = async () => {
    if (!contact || !assignment || running) return;
    setRunning(true);
    setError(null);
    try {
      const count = Math.round(range.points);
      const settings = {
        ...SOLVER_PRESETS[solverPreset].settings,
        runConvergenceCheck: false,
        runSensitivity: false,
      };
      const points: SweepPoint[] = [];
      for (let index = 0; index < count; index += 1) {
        const value =
          count === 1
            ? range.min
            : range.min + ((range.max - range.min) * index) / (count - 1);
        const sweptAssignment = {
          ...assignment,
          parameters: { ...assignment.parameters, [parameter]: value },
        };
        const result = await runHeatSimulation([contact], [sweptAssignment], settings);
        const summary = result.contacts[0]?.summary;
        if (!summary) throw new Error("Sweep run returned no contact result.");
        points.push({
          value,
          peakBasalC: summary.peakBasalTemperatureC,
          omega: summary.omegaBasal,
          timeToThresholdS: summary.timeTo44cS,
        });
      }
      setData(points);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRunning(false);
    }
  };

  const config = SWEEP_PARAMETERS[parameter];
  const metricLabel =
    metric === "peakBasalC"
      ? "Peak basal (°C)"
      : metric === "omega"
        ? "Damage Ω"
        : "Time to 44 °C (s)";

  return (
    <section className="physics-detail parameter-sweep">
      <button
        type="button"
        className="physics-detail__toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className={`result-section__chevron${open ? " is-open" : ""}`}>›</span>
        Parameter sweep
        <span className="physics-detail__hint">explore the design space</span>
      </button>
      {open && (
        <div className="physics-detail__body">
          <div className="parameter-sweep__controls">
            <label>
              <span>Parameter</span>
              <select
                value={parameter}
                onChange={(event) =>
                  setParameter(event.target.value as keyof typeof SWEEP_PARAMETERS)
                }
              >
                {Object.entries(SWEEP_PARAMETERS).map(([key, value]) => (
                  <option key={key} value={key}>{value.label}</option>
                ))}
              </select>
            </label>
            <label><span>Min ({config.unit})</span><input type="number" value={range.min} onChange={(event) => setRange((value) => ({ ...value, min: Number(event.target.value) }))} /></label>
            <label><span>Max ({config.unit})</span><input type="number" value={range.max} onChange={(event) => setRange((value) => ({ ...value, max: Number(event.target.value) }))} /></label>
            <label><span>Points</span><input type="number" min={3} max={15} value={range.points} onChange={(event) => setRange((value) => ({ ...value, points: Math.max(3, Math.min(15, Number(event.target.value))) }))} /></label>
            <button type="button" onClick={() => void runSweep()} disabled={running || range.max <= range.min}>
              {running ? "Sweeping…" : "Run sweep"}
            </button>
          </div>
          {error && <div className="sidebar__error">{error}</div>}
          {data.length > 0 && (
            <>
              <div className="results-chart-tabs">
                <button type="button" className={`results-chart-tab${metric === "peakBasalC" ? " is-active" : ""}`} onClick={() => setMetric("peakBasalC")}>Peak basal</button>
                <button type="button" className={`results-chart-tab${metric === "omega" ? " is-active" : ""}`} onClick={() => setMetric("omega")}>Damage Ω</button>
                <button type="button" className={`results-chart-tab${metric === "timeToThresholdS" ? " is-active" : ""}`} onClick={() => setMetric("timeToThresholdS")}>Time to threshold</button>
              </div>
              <div className="results-chart">
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={data} margin={{ top: 12, right: 12, bottom: 2, left: -8 }}>
                    <CartesianGrid stroke="#3d3d3d" strokeDasharray="3 3" />
                    <XAxis dataKey="value" type="number" unit={` ${config.unit}`} {...AXIS} />
                    <YAxis width={64} {...AXIS} />
                    {metric === "omega" && <ReferenceLine y={1} stroke="#e5554b" strokeDasharray="4 4" />}
                    <Tooltip content={<ChartTooltip unit={metricLabel} />} />
                    <Line type="monotone" dataKey={metric} name={metricLabel} stroke="#20b8ed" strokeWidth={2} dot isAnimationActive={false} connectNulls={false} />
                  </LineChart>
                </ResponsiveContainer>
                <p className="results-chart__caption">
                  Independent solver runs with convergence and sensitivity diagnostics disabled
                  for speed. The current workspace inputs are otherwise held fixed.
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

export function ResultsPanel() {
  const result = useExperimentStore((s) => s.simulationResult);
  const mechanics = useExperimentStore((s) => s.mechanicsResult);
  const status = useExperimentStore((s) => s.simulationStatus);
  const error = useExperimentStore((s) => s.simulationError);
  const selectedContactId = useExperimentStore((s) => s.selectedContactId);
  const selectContact = useExperimentStore((s) => s.selectContact);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const thermalContacts = useMemo(
    () => result?.contacts.filter((contact) => !contact.electrical) ?? [],
    [result],
  );
  const electricalContacts = useMemo(
    () => result?.contacts.filter((contact) => !!contact.electrical) ?? [],
    [result],
  );
  const hasThermal = thermalContacts.length > 0;
  const hasElectrical = electricalContacts.length > 0;
  const hasMech = !!mechanics && mechanics.contacts.length > 0;
  const [view, setView] = useState<"thermal" | "electrical" | "mechanical">("thermal");

  useEffect(() => {
    if (hasThermal) setView("thermal");
    else if (hasElectrical) setView("electrical");
    else if (hasMech) setView("mechanical");
  }, [hasThermal, hasElectrical, hasMech]);

  useEffect(() => {
    if (!result) {
      setSelectedId(null);
      return;
    }
    setSelectedId((current) => {
      if (
        selectedContactId &&
        result.contacts.some((c) => c.contactPointId === selectedContactId)
      ) {
        return selectedContactId;
      }
      if (current && result.contacts.some((c) => c.contactPointId === current)) {
        return current;
      }
      return result.contacts[0]?.contactPointId ?? null;
    });
  }, [result, selectedContactId]);

  const selected = useMemo(
    () =>
        thermalContacts.find((contact) => contact.contactPointId === selectedId) ??
      thermalContacts[0] ??
      null,
    [thermalContacts, selectedId],
  );

  return (
    <div className="results-panel">
      {error && (
        <div className="sidebar__error" role="alert">
          {error}
        </div>
      )}

      {!hasThermal && !hasElectrical && !hasMech && status !== "running" && !error && (
        <div className="results-empty">
          <strong>No run yet</strong>
          <span>Place a stimulus, then press Run in the scene bar.</span>
        </div>
      )}

      {status === "running" && (
        <div className="results-panel__running">Solving the layered tissue response…</div>
      )}

      {[hasThermal, hasElectrical, hasMech].filter(Boolean).length > 1 && (
        <div className="results-view-tabs" role="tablist" aria-label="Result type">
          {hasThermal && (
            <button
              type="button"
              role="tab"
              aria-selected={view === "thermal"}
              className={`results-view-tab${view === "thermal" ? " is-active" : ""}`}
              onClick={() => setView("thermal")}
            >
              Thermal
            </button>
          )}
          {hasElectrical && (
            <button
              type="button"
              role="tab"
              aria-selected={view === "electrical"}
              className={`results-view-tab${view === "electrical" ? " is-active" : ""}`}
              onClick={() => setView("electrical")}
            >
              Electrical
            </button>
          )}
          {hasMech && (
            <button
              type="button"
              role="tab"
              aria-selected={view === "mechanical"}
              className={`results-view-tab${view === "mechanical" ? " is-active" : ""}`}
              onClick={() => setView("mechanical")}
            >
              Mechanical
            </button>
          )}
        </div>
      )}

      {hasMech && view === "mechanical" && mechanics && (
        <MechanicsPanel
          result={mechanics}
          selectedContactId={selectedContactId}
          onSelectContact={selectContact}
        />
      )}

      {hasElectrical && view === "electrical" && (
        <ElectricalPanel
          contacts={electricalContacts}
          selectedContactId={selectedContactId}
          onSelectContact={selectContact}
        />
      )}

      {hasThermal && view === "thermal" && result && (
        <>
          <ProofLabRunStatus />
          {thermalContacts.length > 1 && (
            <MultiContactComparison
              contacts={thermalContacts}
              selectedId={selected?.contactPointId ?? null}
              onSelect={(id) => {
                setSelectedId(id);
                selectContact(id);
              }}
            />
          )}
          {thermalContacts.length > 1 && (
            <div className="results-contact-tabs" role="tablist" aria-label="Heat contact results">
              {thermalContacts.map((contact) => (
                <button
                  type="button"
                  key={contact.contactPointId}
                  role="tab"
                  aria-selected={selected?.contactPointId === contact.contactPointId}
                  className={`results-contact-tab${
                    selected?.contactPointId === contact.contactPointId ? " is-active" : ""
                  }`}
                  onClick={() => {
                    setSelectedId(contact.contactPointId);
                    selectContact(contact.contactPointId);
                  }}
                >
                  {contact.label}
                </button>
              ))}
            </div>
          )}

          {selected && (
            <>
              <ContactResult contact={selected} />
              <ParameterSweepTool contactId={selected.contactPointId} />
            </>
          )}

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
            <span>
              Model diagnostics moved to Proof lab · {result.model.disclaimer}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
