import { useMemo, useState } from "react";
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
import type { MechContactResult, MechanicsResult } from "../../lib/mechanics";

const AXIS = {
  tick: { fill: "#909090", fontSize: 10 },
  tickLine: false,
  axisLine: { stroke: "#4a4a4a" },
} as const;

function verdictTone(verdict: string): "ok" | "warn" | "bad" {
  if (verdict.toLowerCase().includes("fracture")) return "bad";
  if (verdict.toLowerCase().includes("permanent") || verdict.toLowerCase().includes("large"))
    return "warn";
  return "ok";
}

function formatCycles(n: number): string {
  if (!isFinite(n)) return "∞";
  if (n >= 1e6) return `${(n / 1e6).toPrecision(3)}M`;
  if (n >= 1e3) return `${(n / 1e3).toPrecision(3)}k`;
  return n.toFixed(0);
}

function IndentationChart({ contact }: { contact: MechContactResult }) {
  return (
    <div className="results-chart" aria-label="Indentation over time">
      <ResponsiveContainer width="100%" height={200}>
        <LineChart
          data={contact.indentationSeries}
          margin={{ top: 12, right: 10, bottom: 2, left: -6 }}
        >
          <CartesianGrid stroke="#3d3d3d" strokeDasharray="3 3" />
          <ReferenceArea x1={0} x2={contact.inputs.holdS} fill="#20b8ed" fillOpacity={0.06} />
          <XAxis dataKey="timeS" type="number" unit=" s" {...AXIS} />
          <YAxis unit=" µm" width={54} {...AXIS} />
          <Tooltip
            contentStyle={{
              background: "rgba(29,29,29,0.96)",
              border: "1px solid #3a3a3a",
              borderRadius: 6,
              fontSize: 10,
            }}
            formatter={(value) => [`${Number(value).toFixed(1)} µm`, "Indentation"]}
            labelFormatter={(label) => `${Number(label).toFixed(1)} s`}
          />
          <Line
            type="monotone"
            dataKey="indentationUm"
            stroke="#38bdf8"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <p className="results-chart__caption">
        Shaded region is the load hold; the tail is viscoelastic recovery.
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
      })) ?? [],
    [fatigue],
  );
  if (!fatigue) return null;

  return (
    <div className="results-chart" aria-label="Fatigue shape change over cycles">
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 12, right: 10, bottom: 2, left: -6 }}>
          <CartesianGrid stroke="#3d3d3d" strokeDasharray="3 3" />
          <XAxis
            dataKey="logCycle"
            type="number"
            domain={["auto", "auto"]}
            tickFormatter={(v: number) => `10^${v.toFixed(0)}`}
            {...AXIS}
          />
          <YAxis unit=" µm" width={54} {...AXIS} />
          <ReferenceLine
            x={Math.log10(Math.max(1, fatigue.cyclesToFailure))}
            stroke="#e5554b"
            strokeDasharray="4 4"
            label={{ value: "Nf", fill: "#e5554b", fontSize: 9, position: "top" }}
          />
          <Tooltip
            contentStyle={{
              background: "rgba(29,29,29,0.96)",
              border: "1px solid #3a3a3a",
              borderRadius: 6,
              fontSize: 10,
            }}
            formatter={(value) => [`${Number(value).toFixed(2)} µm`, "Permanent set"]}
            labelFormatter={(label) => `≈10^${Number(label).toFixed(1)} cycles`}
          />
          <Line
            type="monotone"
            dataKey="permanentShapeChangeUm"
            stroke="#f0803c"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <p className="results-chart__caption">
        Permanent bone shape change accumulating with load cycles (log scale).
      </p>
    </div>
  );
}

function ContactMech({ contact }: { contact: MechContactResult }) {
  const { summary, fatigue } = contact;
  const tone = verdictTone(summary.verdict);

  return (
    <article className="result-card">
      <div className="result-card__header">
        <strong>{contact.label}</strong>
        <span>{summary.verdict}</span>
      </div>

      <div className={`result-headline is-${tone}`}>
        <div className="result-headline__risk">
          <span className="result-headline__risk-label">Mechanical outcome</span>
          <span className={`result-badge is-${tone}`}>
            {tone === "bad" ? "Failure" : tone === "warn" ? "Permanent" : "Reversible"}
          </span>
        </div>
        <div className="result-headline__metrics">
          <div>
            <span>Peak indentation</span>
            <strong>{summary.peakIndentationUm.toFixed(0)} µm</strong>
          </div>
          <div>
            <span>Deformation</span>
            <strong>{summary.deformationPercent.toFixed(1)} %</strong>
          </div>
          <div>
            <span>Contact stress</span>
            <strong>
              {summary.peakStressKpa >= 1000
                ? `${(summary.peakStressKpa / 1000).toFixed(1)} MPa`
                : `${summary.peakStressKpa.toFixed(1)} kPa`}
            </strong>
          </div>
          <div>
            <span>Residual set</span>
            <strong>{summary.residualIndentationUm.toFixed(1)} µm</strong>
          </div>
        </div>
      </div>

      <IndentationChart contact={contact} />

      <div className="result-section">
        <div className="result-section__body" style={{ paddingTop: 8 }}>
          <table className="result-table">
            <thead>
              <tr>
                <th>Layer</th>
                <th>E (MPa)</th>
                <th>Strain</th>
                <th>Δ (µm)</th>
              </tr>
            </thead>
            <tbody>
              {contact.layers.map((layer) => (
                <tr key={layer.name}>
                  <td title={`${layer.class} · ${layer.source}`}>
                    {layer.name}
                    {layer.yielded ? " ⚠" : ""}
                  </td>
                  <td>{layer.youngsModulusMpa >= 1 ? layer.youngsModulusMpa.toFixed(0) : layer.youngsModulusMpa.toPrecision(2)}</td>
                  <td className={layer.yielded ? "is-bad" : ""}>
                    {(layer.peakStrain * 100).toFixed(2)}%
                  </td>
                  <td>{layer.compressionUm.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="result-note is-dim">
            ⚠ marks a layer whose strain exceeded its yield strain (permanent set).
            Layers below the first bone layer are shielded by it.
          </p>
        </div>
      </div>

      {fatigue && (
        <>
          <FatigueChart contact={contact} />
          <div className="result-bounds">
            <div className="result-bounds__title">Cyclic fatigue · {fatigue.layer}</div>
            <div className="result-bounds__value">
              {(fatigue.damageFraction * 100).toFixed(1)}%
              <span> of fatigue life used ({formatCycles(fatigue.cyclesApplied)} of {formatCycles(fatigue.cyclesToFailure)} cycles)</span>
            </div>
            <div className="result-bounds__row">
              <span>Stress amplitude</span>
              <code>{fatigue.stressAmplitudeMpa.toFixed(1)} MPa</code>
            </div>
            <div className="result-bounds__row">
              <span>Residual stiffness</span>
              <code>{(fatigue.residualModulusRatio * 100).toFixed(1)}% of intact</code>
            </div>
            <div className="result-bounds__row">
              <span>Permanent shape change</span>
              <code>{fatigue.permanentShapeChangeUm.toFixed(2)} µm</code>
            </div>
            <p className="result-note is-dim">{fatigue.verdict}</p>
          </div>
        </>
      )}

      {contact.warnings.length > 0 && (
        <div className="result-section">
          <div className="result-section__body" style={{ paddingTop: 8 }}>
            <ul className="result-warnings">
              {contact.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </article>
  );
}

export function MechanicsPanel({ result }: { result: MechanicsResult }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    result.contacts.find((c) => c.contactPointId === selectedId) ?? result.contacts[0] ?? null;

  if (!selected) {
    return (
      <div className="sidebar__empty">
        <div className="sidebar__empty-title">No mechanical results</div>
        <p className="sidebar__empty-copy">
          Assign a Pressure / mechanical load stimulus to a contact and run.
        </p>
      </div>
    );
  }

  return (
    <div className="results-panel">
      <div className="results-panel__notice">
        <strong>Mechanical model</strong>
        <span>{result.model.validationStatus}</span>
      </div>

      {result.contacts.length > 1 && (
        <div className="results-contact-tabs" role="tablist">
          {result.contacts.map((c) => (
            <button
              type="button"
              key={c.contactPointId}
              role="tab"
              aria-selected={selected.contactPointId === c.contactPointId}
              className={`results-contact-tab${
                selected.contactPointId === c.contactPointId ? " is-active" : ""
              }`}
              onClick={() => setSelectedId(c.contactPointId)}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      <ContactMech contact={selected} />

      <div className="results-panel__citation">
        <strong>Model</strong>
        <span>
          {result.model.name} · {result.model.version}
        </span>
        {result.model.governingEquations.map((eq) => (
          <code key={eq}>{eq}</code>
        ))}
        {result.model.citations.map((c) => (
          <code key={c}>{c}</code>
        ))}
        <span>{result.model.disclaimer}</span>
      </div>
    </div>
  );
}
