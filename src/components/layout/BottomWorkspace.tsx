import {
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { HeatContactResult, SimulationResult } from "../../lib/simulation";
import {
  useExperimentStore,
  type BottomPanelTab,
} from "../../store/experimentStore";
import { ResultsPanel } from "../sidebar/ResultsPanel";
import { ProofLabPanel } from "../validation/ProofLabDashboard";

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

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)} min`;
  return `${(seconds / 3600).toFixed(2)} h`;
}

function linesForContact(contact: HeatContactResult): TerminalLine[] {
  const tone = riskTone(contact);
  return [
    { kind: "ok", text: `${contact.label} · heat · ${contact.skinProfile.label}` },
    {
      kind: "label",
      text: `Device ${contact.inputs.deviceSetpointC.toFixed(1)} °C · ${formatDuration(contact.inputs.exposureS)} · ${contact.inputs.contactAreaMm2.toFixed(0)} mm²`,
    },
    {
      kind: "info",
      text: `Peak skin ${contact.summary.peakSurfaceTemperatureC.toFixed(2)} °C · basal ${contact.summary.peakBasalTemperatureC.toFixed(2)} °C · energy ${contact.summary.totalEnergyDeliveredJ.toFixed(2)} J`,
    },
    {
      kind: tone,
      text:
        tone === "bad"
          ? "Injury risk HIGH"
          : tone === "warn"
            ? "Injury risk ELEVATED"
            : "Injury risk LOW",
    },
  ];
}

function linesFromResult(result: SimulationResult): TerminalLine[] {
  const lines: TerminalLine[] = [
    {
      kind: "info",
      text: `Solver ${result.model.version} · ${result.contacts.length} contact${
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

function OutputPane() {
  const simulationStatus = useExperimentStore((s) => s.simulationStatus);
  const simulationError = useExperimentStore((s) => s.simulationError);
  const simulationResult = useExperimentStore((s) => s.simulationResult);
  const contactCount = useExperimentStore((s) => s.contactPoints.length);
  const bodyRef = useRef<HTMLDivElement>(null);

  const lines = useMemo(() => {
    if (simulationStatus === "running") {
      return [
        { kind: "info" as const, text: "Solving layered Pennes bioheat…" },
      ];
    }
    if (simulationError) {
      return [{ kind: "bad" as const, text: `ERROR · ${simulationError}` }];
    }
    if (simulationResult && simulationResult.contacts.length > 0) {
      return linesFromResult(simulationResult);
    }
    const out: TerminalLine[] = [
      {
        kind: "dim",
        text: "No run yet. Place a stimulus → set temperature & duration → Run.",
      },
    ];
    if (contactCount > 0) {
      out.push({
        kind: "info",
        text: `${contactCount} contact${contactCount === 1 ? "" : "s"} ready.`,
      });
    }
    return out;
  }, [contactCount, simulationError, simulationResult, simulationStatus]);

  useEffect(() => {
    const node = bodyRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [lines]);

  return (
    <div className="bottom-workspace__output" ref={bodyRef}>
      {lines.map((line, index) => (
        <div key={`${index}-${line.text}`} className={`sim-terminal__line is-${line.kind}`}>
          {line.text || "\u00a0"}
        </div>
      ))}
    </div>
  );
}

const TABS: Array<{ id: BottomPanelTab; label: string }> = [
  { id: "output", label: "Output" },
  { id: "results", label: "Results" },
  { id: "proof-lab", label: "Proof lab" },
];

export function BottomWorkspace() {
  const tab = useExperimentStore((s) => s.bottomPanelTab);
  const setTab = useExperimentStore((s) => s.setBottomPanelTab);
  const expanded = useExperimentStore((s) => s.bottomPanelExpanded);
  const setExpanded = useExperimentStore((s) => s.setBottomPanelExpanded);
  const heightPx = useExperimentStore((s) => s.bottomPanelHeightPx);
  const setHeightPx = useExperimentStore((s) => s.setBottomPanelHeightPx);
  const fullscreen = useExperimentStore((s) => s.bottomPanelFullscreen);
  const setFullscreen = useExperimentStore((s) => s.setBottomPanelFullscreen);
  const simulationStatus = useExperimentStore((s) => s.simulationStatus);
  const contactCount = useExperimentStore((s) => s.contactPoints.length);
  const tool = useExperimentStore((s) => s.tool);
  const selectedLabel = useExperimentStore((s) =>
    s.contactPoints.find((c) => c.id === s.selectedContactId)?.label,
  );
  const loadProofLabLibrary = useExperimentStore((s) => s.loadProofLabLibrary);
  const proofLabLibraryStatus = useExperimentStore((s) => s.proofLabLibraryStatus);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  useEffect(() => {
    if (simulationStatus === "complete" || simulationStatus === "running") {
      setExpanded(true);
    }
  }, [setExpanded, simulationStatus]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreen, setFullscreen]);

  const onResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragRef.current = { startY: event.clientY, startH: heightPx };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onResizePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const delta = dragRef.current.startY - event.clientY;
    setHeightPx(dragRef.current.startH + delta);
  };

  const onResizePointerUp = () => {
    dragRef.current = null;
  };

  const statusTone =
    simulationStatus === "error"
      ? "bad"
      : simulationStatus === "complete"
        ? "ok"
        : simulationStatus === "running"
          ? "info"
          : "idle";

  const selectTab = (next: BottomPanelTab) => {
    setTab(next);
    if (next === "proof-lab" && proofLabLibraryStatus === "idle") {
      void loadProofLabLibrary();
    }
  };

  return (
    <footer
      className={`bottom-workspace${expanded ? " is-expanded" : ""}${
        fullscreen ? " is-fullscreen" : ""
      }`}
      style={
        expanded && !fullscreen
          ? ({ ["--vide-bottom-height" as string]: `${heightPx}px` } as CSSProperties)
          : undefined
      }
    >
      {expanded && !fullscreen && (
        <div
          className="bottom-workspace__resize"
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize bottom panel"
        />
      )}

      <div className="bottom-workspace__bar">
        <button
          type="button"
          className="bottom-workspace__toggle"
          aria-expanded={expanded}
          onClick={() => {
            if (fullscreen) {
              setFullscreen(false);
              return;
            }
            setExpanded(!expanded);
          }}
        >
          <span className={`bottom-workspace__chevron${expanded ? " is-open" : ""}`}>›</span>
          <span className={`sim-terminal__status is-${statusTone}`} aria-hidden />
        </button>

        <div className="bottom-workspace__tabs" role="tablist" aria-label="Bottom workspace">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={tab === entry.id && expanded}
              className={`bottom-workspace__tab${
                tab === entry.id && expanded ? " is-active" : ""
              }`}
              onClick={() => selectTab(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <div className="bottom-workspace__meta">
          <span>Tool: {tool}</span>
          <span>
            Contacts: {contactCount}
            {selectedLabel ? ` · ${selectedLabel}` : ""}
          </span>
          <button
            type="button"
            className={`bottom-workspace__fullscreen${fullscreen ? " is-active" : ""}`}
            title={fullscreen ? "Exit fullscreen (Esc)" : "Fullscreen results panel"}
            aria-pressed={fullscreen}
            onClick={() => setFullscreen(!fullscreen)}
          >
            {fullscreen ? "Exit full" : "Fullscreen"}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="bottom-workspace__body" role="tabpanel">
          {tab === "output" && <OutputPane />}
          {tab === "results" && (
            <div className="bottom-workspace__scroll results-panel--docked">
              <ResultsPanel />
            </div>
          )}
          {tab === "proof-lab" && (
            <div className="bottom-workspace__scroll">
              <ProofLabPanel />
            </div>
          )}
        </div>
      )}
    </footer>
  );
}
