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
import type { HeatContactResult } from "../../lib/simulation";
import {
  injuryRiskFromOmega,
  timeToPeakBasalS,
  verdictSentence,
} from "../../lib/verdict";
import { useExperimentStore } from "../../store/experimentStore";
import { MechanicsPanel } from "./MechanicsPanel";

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
  const peakTime = timeToPeakBasalS(contact.series);
  const sentence = verdictSentence(summary, peakTime);

  return (
    <section className={`verdict-card is-${tone}`} aria-live="polite">
      <div className="verdict-card__top">
        <div className="verdict-card__identity">
          <strong>{contact.label}</strong>
          <span>{contact.skinProfile.label}</span>
        </div>
        <div className={`verdict-card__badge is-${tone}`}>
          <span className="verdict-card__badge-label">Injury risk</span>
          <span className="verdict-card__badge-value">{level}</span>
          <span className="verdict-card__badge-threshold">Ω threshold = 1.0</span>
        </div>
      </div>

      <p className="verdict-card__sentence">{sentence}</p>

      <div className="verdict-card__hero">
        <div className="verdict-card__hero-main">
          <span className="verdict-card__hero-label">Peak basal-layer temperature</span>
          <strong className="verdict-card__hero-value">
            {summary.peakBasalTemperatureC.toFixed(1)}
            <span> °C</span>
          </strong>
        </div>
        <div className="verdict-card__hero-side">
          <div>
            <span>Time to 44 °C</span>
            <strong>{formatSeconds(summary.timeTo44cS)}</strong>
          </div>
          <div>
            <span>Damage Ω</span>
            <strong>
              {formatOmega(summary.omegaBasal)}
              <em> / 1.0</em>
            </strong>
          </div>
          <div>
            <span>Peak surface</span>
            <strong className="is-secondary">
              {summary.peakSurfaceTemperatureC.toFixed(1)} °C
            </strong>
          </div>
        </div>
      </div>
    </section>
  );
}

function PhysicsDetail({ contact }: { contact: HeatContactResult }) {
  const [open, setOpen] = useState(false);
  const { summary, bounds } = contact;

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
        <span className="physics-detail__hint">deep temp · energy · uncertainty</span>
      </button>
      {open && (
        <div className="physics-detail__body">
          <dl className="result-card__grid">
            <div>
              <dt>Peak deep</dt>
              <dd>{summary.peakDermalBaseTemperatureC.toFixed(2)} °C</dd>
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
              <dt>Peak surface flux</dt>
              <dd>{summary.peakSurfaceFluxWPerM2.toPrecision(4)} W/m²</dd>
            </div>
            <div>
              <dt>Energy delivered</dt>
              <dd>{summary.totalEnergyDeliveredJ.toPrecision(4)} J</dd>
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
          </div>
        </div>
      )}
    </section>
  );
}

function ContactResult({ contact }: { contact: HeatContactResult }) {
  const [chart, setChart] = useState<"temperature" | "damage" | "depth">("temperature");

  return (
    <article className="result-story">
      <VerdictCard contact={contact} />

      <section className="result-story__charts">
        <div className="results-chart-tabs">
          <button
            type="button"
            className={`results-chart-tab${chart === "temperature" ? " is-active" : ""}`}
            onClick={() => setChart("temperature")}
          >
            Temperature over time
          </button>
          <button
            type="button"
            className={`results-chart-tab${chart === "damage" ? " is-active" : ""}`}
            onClick={() => setChart("damage")}
          >
            Damage accumulation
          </button>
          <button
            type="button"
            className={`results-chart-tab${chart === "depth" ? " is-active" : ""}`}
            onClick={() => setChart("depth")}
          >
            Depth profile (at peak)
          </button>
        </div>
        {chart === "temperature" && <TimeChart contact={contact} />}
        {chart === "damage" && <DamageChart contact={contact} />}
        {chart === "depth" && <DepthChart contact={contact} />}
      </section>

      <PhysicsDetail contact={contact} />
    </article>
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

  const hasThermal = !!result && result.contacts.length > 0;
  const hasMech = !!mechanics && mechanics.contacts.length > 0;
  const [view, setView] = useState<"thermal" | "mechanical">("thermal");

  useEffect(() => {
    if (hasMech && !hasThermal) setView("mechanical");
    else if (hasThermal && !hasMech) setView("thermal");
  }, [hasThermal, hasMech]);

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
      result?.contacts.find((contact) => contact.contactPointId === selectedId) ??
      result?.contacts[0] ??
      null,
    [result, selectedId],
  );

  return (
    <div className="results-panel">
      {error && (
        <div className="sidebar__error" role="alert">
          {error}
        </div>
      )}

      {!hasThermal && !hasMech && status !== "running" && !error && (
        <div className="results-empty">
          <strong>No run yet</strong>
          <span>Place a stimulus, then press Run in the scene bar.</span>
        </div>
      )}

      {status === "running" && (
        <div className="results-panel__running">Solving the layered tissue response…</div>
      )}

      {hasThermal && hasMech && (
        <div className="results-view-tabs" role="tablist" aria-label="Result type">
          <button
            type="button"
            role="tab"
            aria-selected={view === "thermal"}
            className={`results-view-tab${view === "thermal" ? " is-active" : ""}`}
            onClick={() => setView("thermal")}
          >
            Thermal
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "mechanical"}
            className={`results-view-tab${view === "mechanical" ? " is-active" : ""}`}
            onClick={() => setView("mechanical")}
          >
            Mechanical
          </button>
        </div>
      )}

      {hasMech && view === "mechanical" && mechanics && (
        <MechanicsPanel
          result={mechanics}
          selectedContactId={selectedContactId}
          onSelectContact={selectContact}
        />
      )}

      {hasThermal && view === "thermal" && result && (
        <>
          {result.contacts.length > 1 && (
            <div className="results-contact-tabs" role="tablist" aria-label="Heat contact results">
              {result.contacts.map((contact) => (
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
            <span>
              Model diagnostics moved to Proof lab · {result.model.disclaimer}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
