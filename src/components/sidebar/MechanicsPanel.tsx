import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  formatStressKpa,
  mechRiskFromSummary,
  recoveryRatio,
} from "../../lib/mechVerdict";
import type { MechContactResult, MechanicsResult } from "../../lib/mechanics";
import {
  mechanicalSafetyBudget,
  mechanicalSynthesis,
} from "../../lib/resultMetrics";
import { LayeredCrossSection } from "../results/LayeredCrossSection";
import { PhaseStrip } from "../results/PhaseStrip";
import {
  DeepDive,
  SafetyBudgetBar,
  StoryMetric,
  StoryMetrics,
} from "../results/ResultsTier";

const AXIS = {
  tick: { fill: "#909090", fontSize: 10 },
  tickLine: false,
  axisLine: { stroke: "#4a4a4a" },
} as const;

function formatCycles(n: number): string {
  if (!isFinite(n)) return "∞";
  if (n >= 1e6) return `${(n / 1e6).toPrecision(3)}M`;
  if (n >= 1e3) return `${(n / 1e3).toPrecision(3)}k`;
  return n.toFixed(0);
}

function ChartTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  label?: number | string;
  unit: string;
  payload?: Array<{ name: string; value: number; color: string }>;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="results-tooltip">
      <strong>
        {typeof label === "number" ? label.toFixed(2) : label} {unit}
      </strong>
      {payload.map((entry) => (
        <span key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {Number(entry.value).toPrecision(4)}
        </span>
      ))}
    </div>
  );
}

function MechVerdictCard({ contact }: { contact: MechContactResult }) {
  const { summary, fatigue } = contact;
  const { level, tone } = mechRiskFromSummary(summary, fatigue);

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
            <span className="verdict-card__badge-label">Mechanical outcome</span>
            <span className="verdict-card__badge-value">{level}</span>
            {fatigue ? (
              <span className="verdict-card__badge-threshold">
                Fatigue D = {(fatigue.damageFraction * 100).toFixed(0)}% of 100%
              </span>
            ) : (
              <span className="verdict-card__badge-threshold">
                Yield = permanent tissue set
              </span>
            )}
          </div>
          {contact.pressureInjury && (
            <div
              className={`verdict-card__badge is-${
                contact.pressureInjury.classification === "Exceeds threshold"
                  ? "exceeded"
                  : contact.pressureInjury.classification === "Approaching threshold"
                    ? "moderate"
                    : "none"
              }`}
            >
              <span className="verdict-card__badge-label">Pressure-time screen</span>
              <span className="verdict-card__badge-value">
                {contact.pressureInjury.classification}
              </span>
              <span className="verdict-card__badge-threshold">
                extrapolated · {contact.pressureInjury.thresholdRatio.toFixed(2)}× threshold
              </span>
            </div>
          )}
        </div>
      </div>

      <p className="verdict-card__sentence">{mechanicalSynthesis(contact)}</p>
      <SafetyBudgetBar budget={mechanicalSafetyBudget(contact)} />
    </section>
  );
}

function MechanicalStory({ contact }: { contact: MechContactResult }) {
  const { summary, fatigue, pressureInjury } = contact;
  if (fatigue) {
    return (
      <StoryMetrics>
        <StoryMetric
          primary
          label="Cycles applied"
          value={formatCycles(fatigue.cyclesApplied)}
          note={`${formatCycles(fatigue.cyclesToFailure)} predicted cycles to failure`}
        />
        <StoryMetric label="Miner damage" value={(fatigue.damageFraction * 100).toFixed(1)} unit="%" note="D = 1.0 predicts failure" />
        <StoryMetric label="Fatigue verdict" value={fatigue.verdict} note={fatigue.confidence} />
        <StoryMetric label="Peak indentation" value={summary.peakIndentationUm.toFixed(0)} unit="µm" />
      </StoryMetrics>
    );
  }

  return (
    <StoryMetrics>
      <StoryMetric
        primary
        label="Threshold ratio"
        value={pressureInjury ? (pressureInjury.thresholdRatio * 100).toFixed(0) : "—"}
        unit={pressureInjury ? "%" : undefined}
        note={pressureInjury?.classification}
      />
      <StoryMetric label="Peak indentation" value={summary.peakIndentationUm.toFixed(0)} unit="µm" />
      <StoryMetric label="Recovery" value={(recoveryRatio(summary) * 100).toFixed(0)} unit="%" />
      <StoryMetric label="Applied pressure" value={contact.inputs.appliedPressureKpa.toFixed(1)} unit="kPa" note={pressureInjury ? `${(pressureInjury.durationMinutes / 60).toFixed(2)} h hold` : undefined} />
    </StoryMetrics>
  );
}

function MechanicalLayerSlab({ contact }: { contact: MechContactResult }) {
  const bands = useMemo(() => {
    let depth = 0;
    return contact.layers.map((layer) => {
      const start = depth;
      depth += layer.thicknessMm;
      return {
        layerName: layer.name,
        depthStartMm: start,
        depthEndMm: depth,
        value: layer.peakStressKpa,
      };
    });
  }, [contact.layers]);

  if (bands.length === 0) return null;

  const values = bands.map((band) => band.value);
  const min = Math.min(...values);
  const max = Math.max(...values);

  return (
    <LayeredCrossSection
      title="Layers by peak stress"
      bands={bands}
      unit="kPa"
      colorScale={{
        min,
        max: max === min ? max * 1.01 || 1 : max,
        stops: ["#2a2a2a", "#7a5a28", "#e3b341", "#f08c69", "#e5534b"],
      }}
      valueFormatter={(value) => value.toFixed(1)}
    />
  );
}

function PressureDurationChart({ contact }: { contact: MechContactResult }) {
  const risk = contact.pressureInjury;
  if (!risk) return null;
  const yMax = Math.max(
    risk.appliedPressureKpa,
    ...risk.curve.map((point) => point.thresholdPressureKpa),
  );

  return (
    <div className="results-chart" aria-label="Pressure-duration injury screening curve">
      <ResponsiveContainer width="100%" height={260}>
        <LineChart
          data={risk.curve}
          margin={{ top: 12, right: 14, bottom: 2, left: -4 }}
        >
          <CartesianGrid stroke="#3d3d3d" strokeDasharray="3 3" />
          <XAxis
            dataKey="durationMinutes"
            type="number"
            unit=" min"
            domain={[0, "dataMax"]}
            {...AXIS}
          />
          <YAxis
            unit=" kPa"
            width={58}
            domain={[0, Math.ceil(yMax * 1.15)]}
            {...AXIS}
          />
          <Tooltip content={<ChartTooltip unit="min" />} />
          <Line
            name="Screening threshold"
            type="monotone"
            dataKey="thresholdPressureKpa"
            stroke="#e3b341"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <ReferenceDot
            x={risk.durationMinutes}
            y={risk.appliedPressureKpa}
            r={6}
            fill="#38bdf8"
            stroke="#b8e7fb"
            label={{
              value: "This experiment",
              fill: "#b8e7fb",
              fontSize: 10,
              position: "top",
            }}
          />
        </LineChart>
      </ResponsiveContainer>
      <p className="results-chart__caption">
        Pressure-time screening point versus a contemporary sigmoid threshold.
        Extrapolated from rat skeletal muscle; not a validated human clinical limit.
      </p>
    </div>
  );
}

function IndentationChart({ contact }: { contact: MechContactResult }) {
  const isCyclic = contact.inputs.loadingMode === "cyclic";
  return (
    <div className="results-chart" aria-label="Indentation over time">
      <ResponsiveContainer width="100%" height={260}>
        <LineChart
          data={contact.indentationSeries}
          margin={{ top: 12, right: 10, bottom: 2, left: -6 }}
        >
          <CartesianGrid stroke="#3d3d3d" strokeDasharray="3 3" />
          {!isCyclic && contact.inputs.holdS > 0 && (
            <ReferenceArea
              x1={0}
              x2={contact.inputs.holdS}
              fill="#38bdf8"
              fillOpacity={0.06}
            />
          )}
          <XAxis dataKey="timeS" type="number" unit=" s" {...AXIS} />
          <YAxis unit=" µm" width={54} {...AXIS} />
          <ReferenceLine
            y={contact.summary.residualIndentationUm}
            stroke="#e3b341"
            strokeDasharray="4 4"
            label={{
              value: "Residual set",
              fill: "#f0c85a",
              fontSize: 10,
              position: "insideTopRight",
            }}
          />
          <Tooltip content={<ChartTooltip unit="s" />} />
          <Line
            name="Indentation"
            type="monotone"
            dataKey="indentationUm"
            stroke="#38bdf8"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <PhaseStrip
        samples={contact.indentationSeries}
        insetLeftPx={48}
        insetRightPx={10}
      />
      <p className="results-chart__caption">
        {isCyclic
          ? `Cyclic load/recovery at ${contact.inputs.frequencyHz.toFixed(2)} Hz · ${formatCycles(contact.inputs.cycles)} cycles.`
          : "Shaded region is load hold; tail is viscoelastic recovery."}
      </p>
    </div>
  );
}

function LoadChart({ contact }: { contact: MechContactResult }) {
  return (
    <div className="results-chart" aria-label="Applied contact pressure over time">
      <ResponsiveContainer width="100%" height={260}>
        <LineChart
          data={contact.indentationSeries}
          margin={{ top: 12, right: 10, bottom: 2, left: -6 }}
        >
          <CartesianGrid stroke="#3d3d3d" strokeDasharray="3 3" />
          <XAxis dataKey="timeS" type="number" unit=" s" {...AXIS} />
          <YAxis unit=" kPa" width={54} {...AXIS} />
          <Tooltip content={<ChartTooltip unit="s" />} />
          <Line
            name="Applied pressure"
            type="stepAfter"
            dataKey="appliedPressureKpa"
            stroke="#a78bfa"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <p className="results-chart__caption">
        Contact pressure waveform — drives Kelvin–Voigt creep with Boussinesq depth decay.
      </p>
    </div>
  );
}

function LayerStrainChart({ contact }: { contact: MechContactResult }) {
  const data = useMemo(() => {
    let depth = 0;
    return contact.layers.map((layer) => {
      const mid = depth + layer.thicknessMm / 2;
      depth += layer.thicknessMm;
      return {
        depthMm: mid,
        label: layer.name,
        strainPct: layer.peakStrain * 100,
        stressKpa: layer.peakStressKpa,
        yielded: layer.yielded,
      };
    });
  }, [contact.layers]);

  return (
    <div className="results-chart" aria-label="Peak strain by tissue layer">
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 12, right: 10, bottom: 2, left: -6 }}>
          <CartesianGrid stroke="#3d3d3d" strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            tick={{ fill: "#909090", fontSize: 9 }}
            tickLine={false}
            axisLine={{ stroke: "#4a4a4a" }}
            interval={0}
            angle={-18}
            textAnchor="end"
            height={48}
          />
          <YAxis unit=" %" width={48} {...AXIS} />
          <Tooltip
            contentStyle={{
              background: "rgba(29,29,29,0.96)",
              border: "1px solid #3a3a3a",
              borderRadius: 6,
              fontSize: 10,
            }}
            formatter={(value, name) => {
              if (name === "Peak strain") return [`${Number(value).toFixed(2)}%`, name];
              return [`${Number(value).toFixed(1)} kPa`, "Layer stress"];
            }}
          />
          <Bar
            name="Peak strain"
            dataKey="strainPct"
            fill="#f08c69"
            radius={[3, 3, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
      <p className="results-chart__caption">
        Peak strain per layer at end of loading — layers marked yielded in Physics detail.
      </p>
    </div>
  );
}

function FatigueChart({ contact }: { contact: MechContactResult }) {
  const fatigue = contact.fatigue;
  const data = useMemo(
    () =>
      fatigue?.cycleSeries.map((s) => ({
        ...s,
        logCycle: Math.log10(Math.max(1, s.cycle)),
        damagePct: s.damage * 100,
      })) ?? [],
    [fatigue],
  );
  if (!fatigue) return null;

  return (
    <div className="results-chart" aria-label="Fatigue damage accumulation">
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 12, right: 10, bottom: 2, left: -6 }}>
          <CartesianGrid stroke="#3d3d3d" strokeDasharray="3 3" />
          <XAxis
            dataKey="logCycle"
            type="number"
            domain={["auto", "auto"]}
            tickFormatter={(v: number) => `10^${v.toFixed(0)}`}
            {...AXIS}
          />
          <YAxis domain={[0, Math.max(110, fatigue.damageFraction * 110)]} unit=" %" width={54} {...AXIS} />
          <ReferenceLine
            y={100}
            stroke="#e5554b"
            strokeDasharray="4 4"
            label={{
              value: "D = 100% · predicted fracture",
              fill: "#f0a8a3",
              fontSize: 10,
              position: "insideTopRight",
            }}
          />
          <ReferenceLine
            x={Math.log10(Math.max(1, fatigue.cyclesToFailure))}
            stroke="#ffb020"
            strokeDasharray="3 3"
            label={{ value: "Nf", fill: "#ffca68", fontSize: 9, position: "top" }}
          />
          <Tooltip content={<ChartTooltip unit="cycles (log)" />} />
          <Line
            name="Fatigue damage"
            type="monotone"
            dataKey="damagePct"
            stroke="#e5554b"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            name="Permanent shape change"
            type="monotone"
            dataKey="permanentShapeChangeUm"
            stroke="#f0803c"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <p className="results-chart__caption">
        Miner damage on {fatigue.layer} — Basquin S–N with modulus degradation (Pattin 1996).
      </p>
    </div>
  );
}

function MechPhysicsDetail({ contact }: { contact: MechContactResult }) {
  const { summary, fatigue, inputs, layers } = contact;
  const yieldedCount = layers.filter((l) => l.yielded).length;
  const contactRadiusMm = Math.sqrt(inputs.contactAreaMm2 / Math.PI);

  return (
    <section className="physics-detail deep-dive__section">
      <div className="physics-detail__header">
        <strong>Mechanical model</strong>
        <span>layers · protocol · stress · permanent set</span>
      </div>
      <div className="physics-detail__body">
          <dl className="result-card__grid">
            <div>
              <dt>Applied pressure</dt>
              <dd>{inputs.appliedPressureKpa.toFixed(1)} kPa</dd>
            </div>
            <div>
              <dt>Contact area</dt>
              <dd>
                {inputs.contactAreaMm2.toFixed(0)} mm² (r ≈ {contactRadiusMm.toFixed(1)} mm)
              </dd>
            </div>
            <div>
              <dt>Peak contact stress</dt>
              <dd>{formatStressKpa(summary.peakStressKpa)}</dd>
            </div>
            <div>
              <dt>Max layer strain</dt>
              <dd>{(summary.maxStrain * 100).toFixed(2)}%</dd>
            </div>
            <div>
              <dt>Residual indentation</dt>
              <dd>{summary.residualIndentationUm.toFixed(1)} µm</dd>
            </div>
            <div>
              <dt>Column compression</dt>
              <dd>{summary.deformationPercent.toFixed(2)}%</dd>
            </div>
            <div>
              <dt>Modeled column</dt>
              <dd>{summary.totalThicknessMm.toFixed(2)} mm</dd>
            </div>
            {inputs.loadingMode === "cyclic" ? (
              <>
                <div>
                  <dt>Cycles</dt>
                  <dd>{formatCycles(inputs.cycles)} @ {inputs.frequencyHz.toFixed(2)} Hz</dd>
                </div>
                <div>
                  <dt>Duty cycle</dt>
                  <dd>{(inputs.dutyCycle * 100).toFixed(0)}% load / {(100 - inputs.dutyCycle * 100).toFixed(0)}% recovery</dd>
                </div>
              </>
            ) : (
              <>
                <div>
                  <dt>Hold / recovery</dt>
                  <dd>
                    {inputs.holdS.toFixed(1)} s / {inputs.recoveryS.toFixed(1)} s
                  </dd>
                </div>
                <div>
                  <dt>Yielded layers</dt>
                  <dd>{yieldedCount} of {layers.length}</dd>
                </div>
              </>
            )}
          </dl>

          <table className="result-table">
            <thead>
              <tr>
                <th>Layer</th>
                <th>E (MPa)</th>
                <th>Strain</th>
                <th>Stress</th>
                <th>Δ (µm)</th>
                <th>Residual strain</th>
              </tr>
            </thead>
            <tbody>
              {layers.map((layer) => (
                <tr key={layer.name}>
                  <td title={`${layer.class} · ${layer.source}`}>
                    {layer.name}
                    {layer.yielded ? " ⚠" : ""}
                  </td>
                  <td>
                    {layer.youngsModulusMpa >= 1
                      ? layer.youngsModulusMpa.toFixed(0)
                      : layer.youngsModulusMpa.toPrecision(2)}
                  </td>
                  <td className={layer.yielded ? "is-bad" : ""}>
                    {(layer.peakStrain * 100).toFixed(2)}%
                  </td>
                  <td>{formatStressKpa(layer.peakStressKpa)}</td>
                  <td>{layer.compressionUm.toFixed(1)}</td>
                  <td>{(layer.residualStrain * 100).toFixed(3)}%</td>
                </tr>
              ))}
            </tbody>
          </table>

          {fatigue && (
            <div className="result-bounds">
              <div className="result-bounds__title">Cyclic fatigue · {fatigue.layer}</div>
              <div className="result-bounds__value">
                {(fatigue.damageFraction * 100).toFixed(1)}% of life
                <span>
                  {" "}
                  ({formatCycles(fatigue.cyclesApplied)} / {formatCycles(fatigue.cyclesToFailure)} cycles)
                </span>
              </div>
              <p className="result-note is-dim">
                {fatigue.verdict} · {fatigue.confidence}
              </p>
              <div className="result-bounds__row">
                <span>Stress / strain amplitude</span>
                <code>{fatigue.stressAmplitudeMpa.toFixed(3)} MPa / {(fatigue.strainAmplitude * 100).toFixed(3)}%</code>
              </div>
              <div className="result-bounds__row">
                <span>Residual modulus / permanent shape</span>
                <code>{(fatigue.residualModulusRatio * 100).toFixed(1)}% / {fatigue.permanentShapeChangeUm.toFixed(2)} µm</code>
              </div>
              <p className="result-note is-dim">{fatigue.basis}</p>
            </div>
          )}

          {contact.warnings.length > 0 && (
            <ul className="result-warnings">
              {contact.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
      </div>
    </section>
  );
}

function ContactMechResult({ contact }: { contact: MechContactResult }) {
  const isCyclic = contact.inputs.loadingMode === "cyclic";
  const [chart, setChart] = useState<
    "load" | "strain" | "pressure-risk" | "fatigue"
  >("load");

  const tabs = [
    { id: "load" as const, label: "Contact load" },
    { id: "strain" as const, label: "Strain by layer" },
    ...(!isCyclic && contact.pressureInjury
      ? [{ id: "pressure-risk" as const, label: "Pressure-time risk" }]
      : []),
    ...(isCyclic && contact.fatigue
      ? [{ id: "fatigue" as const, label: "Fatigue accumulation" }]
      : []),
  ];

  return (
    <article className="result-story">
      <MechVerdictCard contact={contact} />
      <MechanicalStory contact={contact} />
      <MechanicalLayerSlab contact={contact} />
      <section className="primary-result-chart" aria-label="Primary mechanical response">
        <div className="result-tier-label">Indentation over time</div>
        <IndentationChart contact={contact} />
      </section>
      <DeepDive hint="load history · layer strain · pressure-time screen · fatigue">
        <section className="result-story__charts">
        <div className="results-chart-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`results-chart-tab${chart === tab.id ? " is-active" : ""}`}
              onClick={() => setChart(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {chart === "load" && <LoadChart contact={contact} />}
        {chart === "strain" && <LayerStrainChart contact={contact} />}
        {chart === "pressure-risk" && <PressureDurationChart contact={contact} />}
        {chart === "fatigue" && contact.fatigue && <FatigueChart contact={contact} />}
        </section>
        <MechPhysicsDetail contact={contact} />
      </DeepDive>
    </article>
  );
}

type MechanicsPanelProps = {
  result: MechanicsResult;
  selectedContactId?: string | null;
  onSelectContact?: (id: string) => void;
};

export function MechanicsPanel({
  result,
  selectedContactId,
  onSelectContact,
}: MechanicsPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
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

  const selected =
    result.contacts.find((c) => c.contactPointId === selectedId) ??
    result.contacts[0] ??
    null;

  if (!selected) {
    return (
      <div className="results-empty">
        <strong>No mechanical results</strong>
        <span>Assign a Pressure stimulus to a contact and run.</span>
      </div>
    );
  }

  return (
    <>
      {result.contacts.length > 1 && (
        <div className="results-contact-tabs" role="tablist" aria-label="Mechanical contacts">
          {result.contacts.map((c) => (
            <button
              type="button"
              key={c.contactPointId}
              role="tab"
              aria-selected={selected.contactPointId === c.contactPointId}
              className={`results-contact-tab${
                selected.contactPointId === c.contactPointId ? " is-active" : ""
              }`}
              onClick={() => {
                setSelectedId(c.contactPointId);
                onSelectContact?.(c.contactPointId);
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      <ContactMechResult contact={selected} />

      {result.unsupportedContacts.length > 0 && (
        <div className="results-panel__unsupported">
          {result.unsupportedContacts.map((c) => (
            <div key={c.contactPointId}>
              {c.label} ({c.stimulusType}): {c.reason}
            </div>
          ))}
        </div>
      )}

      <div className="results-panel__citation">
        <strong>Model</strong>
        <span>
          {result.model.name} · {result.model.version}
        </span>
        <span>{result.model.disclaimer}</span>
      </div>
    </>
  );
}
