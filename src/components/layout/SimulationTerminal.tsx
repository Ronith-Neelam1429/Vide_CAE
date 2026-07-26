import { useEffect, useMemo, useRef, useState } from "react";
import type { HeatContactResult, SimulationResult } from "../../lib/simulation";
import { useExperimentStore } from "../../store/experimentStore";

type TerminalLine = {
  kind: "info" | "ok" | "warn" | "bad" | "dim" | "label";
  text: string;
};

function riskTone(contact: HeatContactResult): "ok" | "warn" | "bad" {
  const { summary } = contact;
  if (summary.omegaDermalBase >= 1 || summary.omegaBasal >= 1) return "bad";
  if (summary.omegaBasal >= 0.53 || summary.peakBasalTemperatureC >= 44) return "warn";
  return "ok";
}

function riskWords(tone: "ok" | "warn" | "bad"): string {
  if (tone === "bad") return "HIGH — modeled damage integral crosses the burn threshold";
  if (tone === "warn") return "ELEVATED — skin layers approach or exceed 44 °C";
  return "LOW — peak temperatures stay below typical injury thresholds";
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)} min`;
  return `${(seconds / 3600).toFixed(2)} h`;
}

function padLabel(label: string, width = 22): string {
  return label.padEnd(width, " ");
}

function linesForContact(contact: HeatContactResult): TerminalLine[] {
  const tone = riskTone(contact);
  const shallow = contact.skinProfile.shallowMarkerLabel.split("(")[0].trim();
  const deep = contact.skinProfile.deepMarkerLabel.split("(")[0].trim();

  return [
    { kind: "ok", text: `RUN COMPLETE · ${contact.label} · heat` },
    { kind: "dim", text: "─".repeat(56) },
    {
      kind: "label",
      text: `${padLabel("Device setpoint")}${contact.inputs.deviceSetpointC.toFixed(1)} °C`,
    },
    {
      kind: "label",
      text: `${padLabel("Contact duration")}${formatDuration(contact.inputs.exposureS)}`,
    },
    {
      kind: "label",
      text: `${padLabel("Contact area")}${contact.inputs.contactAreaMm2.toFixed(0)} mm²`,
    },
    {
      kind: "label",
      text: `${padLabel("Tissue site")}${contact.skinProfile.label} (${contact.skinProfile.site})`,
    },
    {
      kind: "dim",
      text: `${padLabel("Site source")}${contact.skinProfile.id}`,
    },
    { kind: "dim", text: "" },
    {
      kind: "info",
      text: `${padLabel("Peak skin surface")}${contact.summary.peakSurfaceTemperatureC.toFixed(2)} °C`,
    },
    {
      kind: "info",
      text: `${padLabel(`Peak ${shallow}`)}${contact.summary.peakBasalTemperatureC.toFixed(2)} °C`,
    },
    {
      kind: "info",
      text: `${padLabel(`Peak ${deep}`)}${contact.summary.peakDermalBaseTemperatureC.toFixed(2)} °C`,
    },
    {
      kind: "info",
      text: `${padLabel("Time to 44 °C")}${
        contact.summary.timeTo44cS === null
          ? "not reached"
          : formatDuration(contact.summary.timeTo44cS)
      }`,
    },
    {
      kind: "info",
      text: `${padLabel("Energy into skin")}${contact.summary.totalEnergyDeliveredJ.toFixed(2)} J`,
    },
    {
      kind: tone,
      text: `${padLabel("Injury risk")}${riskWords(tone)}`,
    },
    {
      kind: "dim",
      text: `${padLabel("Risk label")}${contact.summary.riskClassification}`,
    },
    { kind: "dim", text: "" },
    {
      kind: "dim",
      text: "Chart in Results = temperature of THIS contact over time (not a literature overlay).",
    },
  ];
}

function linesFromResult(result: SimulationResult): TerminalLine[] {
  const lines: TerminalLine[] = [
    {
      kind: "info",
      text: `Solver ${result.model.version} · ${result.contacts.length} heat contact${
        result.contacts.length === 1 ? "" : "s"
      } · ${new Date(result.manifest.generatedAtUnixMs).toLocaleTimeString()}`,
    },
    { kind: "dim", text: "" },
  ];

  result.contacts.forEach((contact, index) => {
    if (index > 0) lines.push({ kind: "dim", text: "" });
    lines.push(...linesForContact(contact));
  });

  return lines;
}

export function SimulationTerminal() {
  const simulationStatus = useExperimentStore((s) => s.simulationStatus);
  const simulationError = useExperimentStore((s) => s.simulationError);
  const simulationResult = useExperimentStore((s) => s.simulationResult);
  const contactCount = useExperimentStore((s) => s.contactPoints.length);
  const tool = useExperimentStore((s) => s.tool);
  const selectedLabel = useExperimentStore((s) =>
    s.contactPoints.find((c) => c.id === s.selectedContactId)?.label,
  );
  const setSidebarTab = useExperimentStore((s) => s.setSidebarTab);
  const [expanded, setExpanded] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const lines = useMemo(() => {
    const out: TerminalLine[] = [];

    if (simulationStatus === "running") {
      out.push({ kind: "info", text: "SOLVING · layered Pennes bioheat through skin…" });
      out.push({
        kind: "dim",
        text: "Computing surface → basal → dermal temperatures for each heat contact.",
      });
      return out;
    }

    if (simulationError) {
      out.push({ kind: "bad", text: `ERROR · ${simulationError}` });
      return out;
    }

    if (simulationResult && simulationResult.contacts.length > 0) {
      return linesFromResult(simulationResult);
    }

    out.push({
      kind: "dim",
      text: "No run yet. Place a stimulus plane → set temperature & duration → Run simulation.",
    });
    if (contactCount > 0) {
      out.push({
        kind: "info",
        text: `${contactCount} contact${contactCount === 1 ? "" : "s"} ready · open Results or press Run.`,
      });
    }
    return out;
  }, [contactCount, simulationError, simulationResult, simulationStatus]);

  useEffect(() => {
    if (simulationStatus === "complete" || simulationStatus === "running") {
      setExpanded(true);
    }
  }, [simulationStatus]);

  useEffect(() => {
    const node = bodyRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [lines, expanded]);

  const statusTone =
    simulationStatus === "error"
      ? "bad"
      : simulationStatus === "complete"
        ? "ok"
        : simulationStatus === "running"
          ? "info"
          : "idle";

  return (
    <footer className={`sim-terminal${expanded ? " is-expanded" : ""}`}>
      <div className="sim-terminal__bar">
        <button
          type="button"
          className="sim-terminal__toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          <span className={`sim-terminal__chevron${expanded ? " is-open" : ""}`}>›</span>
          <span className={`sim-terminal__status is-${statusTone}`} aria-hidden />
          <strong>Simulation output</strong>
          <span className="sim-terminal__summary">
            {simulationStatus === "running"
              ? "solving…"
              : simulationStatus === "complete"
                ? "run complete — expand for readout"
                : simulationStatus === "error"
                  ? "error"
                  : "idle"}
          </span>
        </button>

        <div className="sim-terminal__meta">
          <span>Tool: {tool}</span>
          <span>
            Contacts: {contactCount}
            {selectedLabel ? ` · ${selectedLabel}` : ""}
          </span>
          {simulationResult && (
            <button
              type="button"
              className="sim-terminal__link"
              onClick={() => setSidebarTab("results")}
            >
              Open Results
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="sim-terminal__body" ref={bodyRef}>
          {lines.map((line, index) => (
            <div key={`${index}-${line.text}`} className={`sim-terminal__line is-${line.kind}`}>
              {line.text || "\u00a0"}
            </div>
          ))}
        </div>
      )}
    </footer>
  );
}
