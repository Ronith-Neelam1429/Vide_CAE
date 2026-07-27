import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HeatContactResult } from "../../lib/simulation";
import { injuryRiskFromOmega } from "../../lib/verdict";

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
  const injury = injuryRiskFromOmega(
    contact.summary.omegaBasal,
    contact.summary.omegaDermalBase,
  );
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
    <section className={`verdict-card is-${injury.tone}`} aria-live="polite">
      <div className="verdict-card__top">
        <div className="verdict-card__identity">
          <strong>{contact.label}</strong>
          <span>{contact.skinProfile.label} · electrical-thermal screening</span>
        </div>
        <div className="verdict-card__badges">
          <div className={`verdict-card__badge is-${injury.tone}`}>
            <span className="verdict-card__badge-label">Thermal / burn risk</span>
            <span className="verdict-card__badge-value">{injury.level}</span>
            <span className="verdict-card__badge-threshold">
              Ω {formatOmega(contact.summary.omegaBasal)} / 1.0
            </span>
          </div>
          <div className={`verdict-card__badge is-${activationTone}`}>
            <span className="verdict-card__badge-label">Nerve activation</span>
            <span className="verdict-card__badge-value">{activation.classification}</span>
            <span className="verdict-card__badge-threshold">
              {activation.activationMargin.toFixed(2)}× threshold · {activation.confidence}
            </span>
          </div>
        </div>
      </div>

      <p className="verdict-card__sentence">
        {electrical.peakCurrentMa.toFixed(2)} mA peak through{" "}
        {electrical.totalImpedanceOhm.toFixed(0)} Ω produced{" "}
        {electrical.currentDensityAPerM2.toFixed(1)} A/m² at the electrode. Peak
        basal temperature reached {contact.summary.peakBasalTemperatureC.toFixed(1)}°C;
        the applied pulse is {activation.activationMargin.toFixed(2)}× the
        Weiss-Lapicque sensory threshold.
      </p>

      <div className="verdict-card__hero">
        <div className="verdict-card__hero-main">
          <span className="verdict-card__hero-label">Peak basal temperature</span>
          <strong className="verdict-card__hero-value">
            {contact.summary.peakBasalTemperatureC.toFixed(1)}
            <span> °C</span>
          </strong>
        </div>
        <div className="verdict-card__hero-side">
          <div>
            <span>Peak current</span>
            <strong>{electrical.peakCurrentMa.toFixed(2)} mA</strong>
          </div>
          <div>
            <span>Power</span>
            <strong>{electrical.totalPowerW.toPrecision(3)} W</strong>
          </div>
          <div>
            <span>Charge / pulse</span>
            <strong>{electrical.chargePerPulseUc.toFixed(3)} µC</strong>
          </div>
          <div>
            <span>Charge density</span>
            <strong className="is-secondary">
              {electrical.chargeDensityUcPerCm2.toFixed(3)} µC/cm²
            </strong>
          </div>
        </div>
      </div>
    </section>
  );
}

function ElectricalTemperatureChart({ contact }: { contact: HeatContactResult }) {
  return (
    <div className="results-chart">
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={contact.series} margin={{ top: 12, right: 10, bottom: 2, left: -18 }}>
          <CartesianGrid stroke="#3d3d3d" strokeDasharray="3 3" />
          <XAxis dataKey="timeS" type="number" unit=" s" {...AXIS} />
          <YAxis domain={["auto", "auto"]} unit=" °C" width={56} {...AXIS} />
          <ReferenceLine y={44} stroke="#ffb020" strokeDasharray="4 4" />
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
      <p className="results-chart__caption">
        Pennes bioheat response to internal Joule source q = J²/σ; cooling continues
        after stimulation.
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
  const yMax = Math.max(
    activation.appliedCurrentMa,
    ...data.map((point) => point.thresholdMa),
  );

  return (
    <div className="results-chart">
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 12, right: 12, bottom: 2, left: -8 }}>
          <CartesianGrid stroke="#3d3d3d" strokeDasharray="3 3" />
          <XAxis dataKey="durationUs" type="number" unit=" µs" scale="log" domain={["dataMin", "dataMax"]} {...AXIS} />
          <YAxis unit=" mA" width={54} domain={[0, yMax * 1.15]} {...AXIS} />
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
            fill="#38bdf8"
            stroke="#b8e7fb"
            label={{ value: "Applied pulse", fill: "#b8e7fb", fontSize: 10, position: "top" }}
          />
        </LineChart>
      </ResponsiveContainer>
      <p className="results-chart__caption">
        Weiss-Lapicque threshold. Human Aδ starting values are extrapolated from an
        intraepidermal-electrode study to this surface-electrode geometry.
      </p>
    </div>
  );
}

function ElectricalPhysics({ contact }: { contact: HeatContactResult }) {
  const [open, setOpen] = useState(false);
  const electrical = contact.electrical!;
  return (
    <section className="physics-detail">
      <button
        type="button"
        className="physics-detail__toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className={`result-section__chevron${open ? " is-open" : ""}`}>›</span>
        Physics detail
        <span className="physics-detail__hint">impedance · power · conductivity</span>
      </button>
      {open && (
        <div className="physics-detail__body">
          <dl className="result-card__grid">
            <div><dt>Tissue resistance</dt><dd>{electrical.tissueResistanceOhm.toFixed(0)} Ω</dd></div>
            <div><dt>Interface impedance</dt><dd>{electrical.interfaceImpedanceOhm.toFixed(0)} Ω</dd></div>
            <div><dt>Applied voltage</dt><dd>{electrical.appliedVoltageV.toFixed(2)} V</dd></div>
            <div><dt>RMS current</dt><dd>{electrical.rmsCurrentMa.toFixed(3)} mA</dd></div>
            <div><dt>Rheobase / chronaxie</dt><dd>{electrical.nerveActivation.rheobaseMa.toFixed(3)} mA / {electrical.nerveActivation.chronaxieUs.toFixed(0)} µs</dd></div>
            <div><dt>Return path</dt><dd>{electrical.returnPathAssumption}</dd></div>
          </dl>
          <table className="result-table">
            <thead><tr><th>Layer</th><th>σ (S/m)</th><th>Confidence</th><th>q (W/m³)</th><th>ΔV</th></tr></thead>
            <tbody>
              {electrical.layers.map((layer) => (
                <tr key={`${layer.name}-${layer.depthStartMm}`}>
                  <td>{layer.name}</td>
                  <td>{layer.conductivitySPerM.toExponential(2)}</td>
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
      )}
    </section>
  );
}

function ElectricalContact({ contact }: { contact: HeatContactResult }) {
  const [chart, setChart] = useState<"temperature" | "current" | "activation">("temperature");
  return (
    <article className="result-story">
      <ElectricalVerdict contact={contact} />
      <section className="result-story__charts">
        <div className="results-chart-tabs">
          <button type="button" className={`results-chart-tab${chart === "temperature" ? " is-active" : ""}`} onClick={() => setChart("temperature")}>Temperature over time</button>
          <button type="button" className={`results-chart-tab${chart === "current" ? " is-active" : ""}`} onClick={() => setChart("current")}>Current density vs depth</button>
          <button type="button" className={`results-chart-tab${chart === "activation" ? " is-active" : ""}`} onClick={() => setChart("activation")}>Activation margin</button>
        </div>
        {chart === "temperature" && <ElectricalTemperatureChart contact={contact} />}
        {chart === "current" && <CurrentDepthChart contact={contact} />}
        {chart === "activation" && <ActivationChart contact={contact} />}
      </section>
      <ElectricalPhysics contact={contact} />
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
