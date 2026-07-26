import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { exportSimulationCsv } from "../../lib/exportSimulationCsv";
import type { HeatContactResult } from "../../lib/simulation";
import { useExperimentStore } from "../../store/experimentStore";

function formatSeconds(value: number | null) {
  return value === null ? "Not reached" : `${value.toFixed(2)} s`;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  label?: number;
  payload?: Array<{ name: string; value: number; color: string }>;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="results-tooltip">
      <strong>{Number(label).toFixed(2)} s</strong>
      {payload.map((entry) => (
        <span key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {Number(entry.value).toFixed(2)} °C
        </span>
      ))}
    </div>
  );
}

function ThermalChart({ contact }: { contact: HeatContactResult }) {
  return (
    <div className="results-chart" aria-label={`${contact.label} temperature over time`}>
      <ResponsiveContainer width="100%" height={210}>
        <LineChart
          data={contact.series}
          margin={{ top: 12, right: 12, bottom: 2, left: -16 }}
        >
          <CartesianGrid stroke="#3d3d3d" strokeDasharray="3 3" />
          <XAxis
            dataKey="timeS"
            type="number"
            tick={{ fill: "#909090", fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: "#4a4a4a" }}
            unit=" s"
          />
          <YAxis
            domain={["auto", "auto"]}
            tick={{ fill: "#909090", fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: "#4a4a4a" }}
            unit=" °C"
            width={56}
          />
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
          <Tooltip content={<ChartTooltip />} />
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
            name="Basal layer"
            type="monotone"
            dataKey="basalTemperatureC"
            stroke="#f08c69"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="results-chart__legend">
        <span><i className="is-surface" />Surface</span>
        <span><i className="is-basal" />Basal layer</span>
      </div>
    </div>
  );
}

export function ResultsPanel() {
  const result = useExperimentStore((s) => s.simulationResult);
  const status = useExperimentStore((s) => s.simulationStatus);
  const error = useExperimentStore((s) => s.simulationError);
  const run = useExperimentStore((s) => s.runSimulation);
  const clear = useExperimentStore((s) => s.clearSimulation);
  const contacts = useExperimentStore((s) => s.contactPoints);
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

      {error && <div className="sidebar__error" role="alert">{error}</div>}

      {!result && status !== "running" && !error && (
        <div className="sidebar__empty">
          <div className="sidebar__empty-title">No simulation results</div>
          <p className="sidebar__empty-copy">
            Run the heat model for your assigned Heat contacts. Cold,
            electrical, and pressure models are not available yet.
          </p>
        </div>
      )}

      {status === "running" && (
        <div className="results-panel__running">
          Computing a 1D layered tissue response…
        </div>
      )}

      {result && (
        <>
          <div className="results-panel__toolbar">
            <span className="results-panel__run-label">
              {result.contacts.length} heat contact
              {result.contacts.length === 1 ? "" : "s"} simulated
            </span>
            <button
              type="button"
              className="results-panel__export"
              onClick={() => exportSimulationCsv(result)}
            >
              Export CSV
            </button>
          </div>

          <div className="results-panel__notice">
            <strong>Research prototype</strong>
            <span>{result.model.disclaimer}</span>
          </div>

          {result.contacts.length > 0 && (
            <>
              <div className="results-contact-tabs" role="tablist" aria-label="Heat contact results">
                {result.contacts.map((contact) => (
                  <button
                    type="button"
                    key={contact.contactPointId}
                    role="tab"
                    aria-selected={selected?.contactPointId === contact.contactPointId}
                    className={`results-contact-tab${
                      selected?.contactPointId === contact.contactPointId
                        ? " is-active"
                        : ""
                    }`}
                    onClick={() => setSelectedId(contact.contactPointId)}
                  >
                    {contact.label}
                  </button>
                ))}
              </div>

              {selected && (
                <article className="result-card">
                  <div className="result-card__header">
                    <strong>{selected.label}</strong>
                    <span>{selected.riskClassification}</span>
                  </div>
                  <ThermalChart contact={selected} />
                  <dl className="result-card__grid">
                    <div>
                      <dt>Surface target</dt>
                      <dd>{selected.surfaceTemperatureC.toFixed(1)} °C</dd>
                    </div>
                    <div>
                      <dt>Peak basal</dt>
                      <dd>{selected.peakBasalTemperatureC.toFixed(1)} °C</dd>
                    </div>
                    <div>
                      <dt>Exposure</dt>
                      <dd>{selected.durationS.toFixed(2)} s</dd>
                    </div>
                    <div>
                      <dt>Time to 44 °C</dt>
                      <dd>{formatSeconds(selected.timeTo44cS)}</dd>
                    </div>
                    <div>
                      <dt>Damage Ω</dt>
                      <dd>{selected.arrheniusDamageOmega.toExponential(2)}</dd>
                    </div>
                    <div>
                      <dt>Samples</dt>
                      <dd>{selected.series.length}</dd>
                    </div>
                  </dl>
                </article>
              )}
            </>
          )}

          {result.unsupportedContacts.length > 0 && (
            <>
              <div className="sidebar__section-label" style={{ paddingLeft: 0 }}>
                Not simulated
              </div>
              <div className="results-panel__unsupported">
                {result.unsupportedContacts.map((contact) => (
                  <div key={contact.contactPointId}>
                    {contact.label}: {contact.stimulusType} — {contact.reason}
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="results-panel__citation">
            <strong>Model</strong>
            <span>{result.model.name}</span>
            <span>{result.model.citation}</span>
          </div>
        </>
      )}
    </div>
  );
}
