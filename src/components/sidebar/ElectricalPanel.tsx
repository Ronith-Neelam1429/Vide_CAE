import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
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
import type { HeatContactResult } from "../../lib/simulation";
import {
  electricalSafetyBudget,
  electricalSynthesis,
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

function formatOmega(value: number) {
  if (value === 0) return "0";
  if (value < 0.001 || value >= 1000) return value.toExponential(2);
  return value.toFixed(3);
}

function ElectricalVerdict({ contact }: { contact: HeatContactResult }) {
  const electrical = contact.electrical!;
  const activation = electrical.nerveActivation;
  const activationTone =
    activation.classification === "Painful"
      ? "exceeded"
      : activation.classification === "Motor stimulation"
        ? "high"
        : activation.classification === "Perceptible"
          ? "moderate"
          : "none";

  return (
    <section className={`verdict-card results-verdict is-${activationTone}`} aria-live="polite">
      <div className="result-tier-label">Verdict</div>
      <div className="verdict-card__top">
        <div className="verdict-card__identity">
          <strong>{contact.label}</strong>
          <span>{contact.skinProfile.label} · electrical-thermal screening</span>
        </div>
        <div className="verdict-card__badges">
          <div className={`verdict-card__badge is-${activationTone}`}>
            <span className="verdict-card__badge-label">Nerve activation</span>
            <span className="verdict-card__badge-value">{activation.classification}</span>
            <span className="verdict-card__badge-threshold">
              {activation.activationMargin.toFixed(2)}× threshold · {activation.confidence}
            </span>
          </div>
        </div>
      </div>

      <p className="verdict-card__sentence">{electricalSynthesis(activation)}</p>
      <SafetyBudgetBar budget={electricalSafetyBudget(activation)} />
    </section>
  );
}

function ElectricalStory({ contact }: { contact: HeatContactResult }) {
  const electrical = contact.electrical!;
  const activation = electrical.nerveActivation;
  return (
    <StoryMetrics>
      <StoryMetric
        primary
        label="Activation margin"
        value={activation.activationMargin.toFixed(2)}
        unit="×"
        note="applied ÷ modeled threshold"
      />
      <StoryMetric label="Peak current" value={electrical.peakCurrentMa.toFixed(2)} unit="mA" />
      <StoryMetric label="RMS current" value={electrical.rmsCurrentMa.toFixed(2)} unit="mA" />
      <StoryMetric
        label="Charge density"
        value={electrical.chargeDensityUcPerCm2.toFixed(3)}
        unit="µC/cm²"
        note="30 µC/cm²/phase is a material-dependent reference, not a hard limit"
      />
      <StoryMetric
        label="Rheobase / chronaxie"
        value={`${activation.rheobaseMa.toFixed(3)} mA / ${activation.chronaxieUs.toFixed(0)} µs`}
        note={`${activation.thresholdCurrentMa.toFixed(3)} mA threshold at applied pulse`}
      />
      <StoryMetric label="Total power" value={electrical.totalPowerW.toPrecision(3)} unit="W" />
    </StoryMetrics>
  );
}

function ElectricalTemperatureChart({ contact }: { contact: HeatContactResult }) {
  return (
    <div className="results-chart" aria-label={`${contact.label} electrical thermal response`}>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={contact.series} margin={{ top: 12, right: 10, bottom: 2, left: -18 }}>
          <CartesianGrid stroke="#3d3d3d" strokeDasharray="3 3" />
          {contact.inputs.exposureS > 0 && (
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
            label={{ value: "44 °C", fill: "#e5b15b", fontSize: 10, position: "insideTopRight" }}
          />
          <Tooltip
            contentStyle={{
              background: "rgba(29,29,29,0.96)",
              border: "1px solid #3a3a3a",
              borderRadius: 6,
              fontSize: 10,
            }}
          />
          <Line
            name="Surface"
            type="monotone"
            dataKey="surfaceTemperatureC"
            stroke="#20b8ed"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            name="Basal"
            type="monotone"
            dataKey="basalTemperatureC"
            stroke="#f08c69"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            name="Deep"
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
      <p className="results-chart__caption">
        Shaded region is electrical stimulation; the tail is post-stimulation cooling.
        Pennes bioheat response uses internal Joule source q = J²/σ.
      </p>
    </div>
  );
}

function CurrentDepthChart({ contact }: { contact: HeatContactResult }) {
  const data = contact.electrical!.layers.map((layer) => ({
    ...layer,
    depthMm: (layer.depthStartMm + layer.depthEndMm) / 2,
    powerKwPerM3: layer.powerDensityWPerM3 / 1000,
  }));

  return (
    <div className="results-chart">
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ top: 12, right: 8, bottom: 2, left: -8 }}>
          <CartesianGrid stroke="#3d3d3d" strokeDasharray="3 3" />
          <XAxis dataKey="depthMm" type="number" unit=" mm" {...AXIS} />
          <YAxis yAxisId="j" unit=" A/m²" width={60} {...AXIS} />
          <YAxis
            yAxisId="q"
            orientation="right"
            unit=" kW/m³"
            width={70}
            {...AXIS}
          />
          <Tooltip
            contentStyle={{
              background: "rgba(29,29,29,0.96)",
              border: "1px solid #3a3a3a",
              borderRadius: 6,
              fontSize: 10,
            }}
          />
          <Line
            yAxisId="j"
            name="Current density"
            type="stepAfter"
            dataKey="currentDensityAPerM2"
            stroke="#a78bfa"
            strokeWidth={2}
            dot
            isAnimationActive={false}
          />
          <Bar
            yAxisId="q"
            name="Joule power density"
            dataKey="powerKwPerM3"
            fill="#f08c69"
            opacity={0.55}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="results-chart__caption">
        1-D current continuity keeps J constant; low-conductivity layers dissipate more
        power per volume.
      </p>
    </div>
  );
}

function ActivationChart({ contact }: { contact: HeatContactResult }) {
  const activation = contact.electrical!.nerveActivation;
  const data = useMemo(
    () =>
      [20, 50, 100, 200, 300, 500, 1000, 2000, 5000].map((durationUs) => ({
        durationUs,
        thresholdMa:
          activation.rheobaseMa * (1 + activation.chronaxieUs / durationUs),
      })),
    [activation],
  );
  const thresholdAtPulse =
    activation.rheobaseMa * (1 + activation.chronaxieUs / activation.pulseDurationUs);
  const aboveThreshold = activation.appliedCurrentMa >= thresholdAtPulse;
  const yMax = Math.max(
    activation.appliedCurrentMa,
    activation.rheobaseMa,
    ...data.map((point) => point.thresholdMa),
  );

  return (
    <div className="results-chart" aria-label="Strength-duration activation curve">
      <p className={`activation-status ${aboveThreshold ? "is-above" : "is-below"}`}>
        Applied pulse is {aboveThreshold ? "above" : "below"} threshold
        {" · "}
        {activation.appliedCurrentMa.toFixed(3)} mA vs {thresholdAtPulse.toFixed(3)} mA at{" "}
        {activation.pulseDurationUs.toFixed(0)} µs
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 12, right: 12, bottom: 2, left: -8 }}>
          <CartesianGrid stroke="#3d3d3d" strokeDasharray="3 3" />
          <XAxis
            dataKey="durationUs"
            type="number"
            unit=" µs"
            scale="log"
            domain={["dataMin", "dataMax"]}
            {...AXIS}
          />
          <YAxis unit=" mA" width={54} domain={[0, yMax * 1.15]} {...AXIS} />
          <ReferenceLine
            y={activation.rheobaseMa}
            stroke="#909090"
            strokeDasharray="4 4"
            label={{
              value: "Rheobase",
              fill: "#909090",
              fontSize: 10,
              position: "insideTopRight",
            }}
          />
          <Tooltip
            contentStyle={{
              background: "rgba(29,29,29,0.96)",
              border: "1px solid #3a3a3a",
              borderRadius: 6,
              fontSize: 10,
            }}
          />
          <Line
            name="Activation threshold"
            type="monotone"
            dataKey="thresholdMa"
            stroke="#e3b341"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <ReferenceDot
            x={activation.pulseDurationUs}
            y={activation.appliedCurrentMa}
            r={6}
            fill={aboveThreshold ? "#e5554b" : "#38bdf8"}
            stroke="#b8e7fb"
            label={{
              value: "Applied pulse",
              fill: aboveThreshold ? "#f08c69" : "#b8e7fb",
              fontSize: 10,
              position: "top",
            }}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="results-chart__legend">
        <span>
          <i style={{ background: "#e3b341" }} />
          Weiss–Lapicque threshold
        </span>
        <span>
          <i style={{ background: aboveThreshold ? "#e5554b" : "#38bdf8" }} />
          Applied pulse
        </span>
      </div>
      <p className="results-chart__caption">
        threshold = rheobase × (1 + chronaxie / pulse duration). Human Aδ starting values are
        extrapolated from an intraepidermal-electrode study to this surface-electrode geometry.
      </p>
    </div>
  );
}

function ElectricalLayerSlab({ contact }: { contact: HeatContactResult }) {
  const layers = contact.electrical?.layers ?? [];
  const bands = useMemo(
    () =>
      layers.map((layer) => ({
        layerName: layer.name,
        depthStartMm: layer.depthStartMm,
        depthEndMm: layer.depthEndMm,
        value: layer.currentDensityAPerM2,
      })),
    [layers],
  );
  if (bands.length === 0) return null;

  const values = bands.map((band) => band.value);
  const min = Math.min(...values);
  const max = Math.max(...values);

  return (
    <LayeredCrossSection
      title="Layers by current density"
      bands={bands}
      unit="A/m²"
      colorScale={{
        min,
        max: max === min ? max * 1.01 || 1 : max,
        stops: ["#2a2a2a", "#046a9a", "#0696d7", "#e3b341"],
      }}
      valueFormatter={(value) => value.toPrecision(3)}
    />
  );
}

function ElectricalPhysics({ contact }: { contact: HeatContactResult }) {
  const electrical = contact.electrical!;
  return (
    <section className="physics-detail deep-dive__section">
      <div className="physics-detail__header">
        <strong>Electrical model</strong>
        <span>impedance · charge · conductivity · thermal outcome</span>
      </div>
      <div className="physics-detail__body">
          <dl className="result-card__grid">
            <div><dt>Tissue resistance</dt><dd>{electrical.tissueResistanceOhm.toFixed(0)} Ω</dd></div>
            <div><dt>Interface impedance</dt><dd>{electrical.interfaceImpedanceOhm.toFixed(0)} Ω</dd></div>
            <div><dt>Total impedance</dt><dd>{electrical.totalImpedanceOhm.toFixed(0)} Ω</dd></div>
            <div><dt>Applied voltage</dt><dd>{electrical.appliedVoltageV.toFixed(2)} V</dd></div>
            <div><dt>RMS current</dt><dd>{electrical.rmsCurrentMa.toFixed(3)} mA</dd></div>
            <div><dt>Current density</dt><dd>{electrical.currentDensityAPerM2.toFixed(3)} A/m²</dd></div>
            <div><dt>Charge per pulse</dt><dd>{electrical.chargePerPulseUc.toFixed(3)} µC</dd></div>
            <div><dt>Rheobase / chronaxie</dt><dd>{electrical.nerveActivation.rheobaseMa.toFixed(3)} mA / {electrical.nerveActivation.chronaxieUs.toFixed(0)} µs</dd></div>
            <div><dt>Threshold current</dt><dd>{electrical.nerveActivation.thresholdCurrentMa.toFixed(3)} mA</dd></div>
            <div><dt>Peak basal / Ω</dt><dd>{contact.summary.peakBasalTemperatureC.toFixed(2)} °C / {formatOmega(contact.summary.omegaBasal)}</dd></div>
            <div><dt>Return path</dt><dd>{electrical.returnPathAssumption}</dd></div>
          </dl>
          <table className="result-table">
            <thead><tr><th>Layer</th><th>σ (S/m)</th><th>J (A/m²)</th><th>Confidence</th><th>q (W/m³)</th><th>ΔV</th></tr></thead>
            <tbody>
              {electrical.layers.map((layer) => (
                <tr key={`${layer.name}-${layer.depthStartMm}`}>
                  <td>{layer.name}</td>
                  <td>{layer.conductivitySPerM.toExponential(2)}</td>
                  <td>{layer.currentDensityAPerM2.toExponential(2)}</td>
                  <td>{layer.conductivityConfidence}</td>
                  <td>{layer.powerDensityWPerM3.toExponential(2)}</td>
                  <td>{layer.voltageDropV.toFixed(3)} V</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="result-note is-dim">{electrical.citation}</p>
          {contact.warnings.length > 0 && (
            <ul className="result-warnings">
              {contact.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          )}
      </div>
    </section>
  );
}

function ElectricalContact({ contact }: { contact: HeatContactResult }) {
  const [chart, setChart] = useState<"current" | "activation">("activation");
  return (
    <article className="result-story">
      <ElectricalVerdict contact={contact} />
      <ElectricalStory contact={contact} />
      <ElectricalLayerSlab contact={contact} />
      <section className="primary-result-chart" aria-label="Primary electrical thermal response">
        <div className="result-tier-label">Temperature over time</div>
        <ElectricalTemperatureChart contact={contact} />
      </section>
      <DeepDive hint="strength-duration · current density · impedance · layers">
        <section className="result-story__charts">
        <div className="results-chart-tabs">
          <button type="button" className={`results-chart-tab${chart === "activation" ? " is-active" : ""}`} onClick={() => setChart("activation")}>Strength–duration</button>
          <button type="button" className={`results-chart-tab${chart === "current" ? " is-active" : ""}`} onClick={() => setChart("current")}>Current density vs depth</button>
        </div>
        {chart === "activation" && <ActivationChart contact={contact} />}
        {chart === "current" && <CurrentDepthChart contact={contact} />}
        </section>
        <ElectricalPhysics contact={contact} />
      </DeepDive>
    </article>
  );
}

export function ElectricalPanel({
  contacts,
  selectedContactId,
  onSelectContact,
}: {
  contacts: HeatContactResult[];
  selectedContactId: string | null;
  onSelectContact: (id: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    setSelectedId((current) => {
      if (selectedContactId && contacts.some((c) => c.contactPointId === selectedContactId)) {
        return selectedContactId;
      }
      if (current && contacts.some((c) => c.contactPointId === current)) return current;
      return contacts[0]?.contactPointId ?? null;
    });
  }, [contacts, selectedContactId]);
  const selected =
    contacts.find((contact) => contact.contactPointId === selectedId) ?? contacts[0] ?? null;
  if (!selected) return null;

  return (
    <>
      {contacts.length > 1 && (
        <div className="results-contact-tabs" role="tablist" aria-label="Electrical contacts">
          {contacts.map((contact) => (
            <button
              key={contact.contactPointId}
              type="button"
              role="tab"
              aria-selected={selected.contactPointId === contact.contactPointId}
              className={`results-contact-tab${selected.contactPointId === contact.contactPointId ? " is-active" : ""}`}
              onClick={() => {
                setSelectedId(contact.contactPointId);
                onSelectContact(contact.contactPointId);
              }}
            >
              {contact.label}
            </button>
          ))}
        </div>
      )}
      <ElectricalContact contact={selected} />
    </>
  );
}
