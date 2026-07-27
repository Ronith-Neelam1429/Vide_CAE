import { importDesignFromDisk } from "../../lib/importDesign";
import { useExperimentStore } from "../../store/experimentStore";

function BodyGlyph({ active }: { active: boolean }) {
  return (
    <svg className="scene-bar__body-glyph" viewBox="0 0 40 48" aria-hidden>
      <ellipse cx="20" cy="7" rx="5" ry="6" fill={active ? "#d4a08a" : "#6a6a6a"} />
      <path
        d="M12 16c0-2 3.5-3.5 8-3.5s8 1.5 8 3.5v8c0 3-2 5-4 6l1 12h-10l1-12c-2-1-4-3-4-6z"
        fill={active ? "#c48972" : "#555"}
      />
      <path
        d="M8 18c-2 1-4 4-3 8l3 4 4-2-2-8zm24 0c2 1 4 4 3 8l-3 4-4-2 2-8z"
        fill={active ? "#d4a08a" : "#6a6a6a"}
      />
      <path
        d="M15 42l-1 4h4l1-4zm6 0l1 4h4l-1-4z"
        fill={active ? "#b87a64" : "#4a4a4a"}
      />
    </svg>
  );
}

export function SceneBar() {
  const showBody = useExperimentStore((s) => s.showBody);
  const toggleShowBody = useExperimentStore((s) => s.toggleShowBody);
  const resetAnatomyTransform = useExperimentStore((s) => s.resetAnatomyTransform);
  const design = useExperimentStore((s) => s.design);
  const clearDesign = useExperimentStore((s) => s.clearDesign);
  const isImporting = useExperimentStore((s) => s.isImporting);
  const tool = useExperimentStore((s) => s.tool);
  const setTool = useExperimentStore((s) => s.setTool);
  const setSidebarTab = useExperimentStore((s) => s.setSidebarTab);
  const contactCount = useExperimentStore((s) => s.contactPoints.length);
  const simulationStatus = useExperimentStore((s) => s.simulationStatus);
  const runSimulation = useExperimentStore((s) => s.runSimulation);
  const canPlace = showBody || design !== null;
  const placing = tool === "contact";
  const canRun = contactCount > 0 && simulationStatus !== "running";
  const running = simulationStatus === "running";

  return (
    <div className="scene-bar" role="toolbar" aria-label="Scene objects">
      <span className="scene-bar__label">Scene</span>

      <button
        type="button"
        className={`scene-bar__tile${showBody ? " is-active" : ""}`}
        title={showBody ? "Hide human body" : "Show human body"}
        aria-pressed={showBody}
        onClick={() => toggleShowBody()}
      >
        <span className="scene-bar__tile-art">
          <BodyGlyph active={showBody} />
        </span>
        <span className="scene-bar__tile-caption">Body</span>
      </button>

      <button
        type="button"
        className="scene-bar__tile"
        title="Import STL or OBJ device mesh"
        disabled={isImporting}
        onClick={() => void importDesignFromDisk()}
      >
        <span className="scene-bar__tile-art scene-bar__tile-art--import">
          <svg viewBox="0 0 20 20" fill="none" aria-hidden>
            <path
              d="M10 3v9M6.5 8.5 10 12l3.5-3.5M4 14.5v1a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 16 15.5v-1"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="scene-bar__tile-caption">
          {isImporting ? "…" : "Import"}
        </span>
      </button>

      {design && (
        <div className="scene-bar__tile is-active scene-bar__tile--static" title={design.fileName}>
          <span className="scene-bar__tile-art scene-bar__tile-art--mesh">
            <svg viewBox="0 0 32 32" aria-hidden>
              <path
                d="M6 22 16 6l10 16H6z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              />
              <path d="M10 20h12M13 15h6" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </span>
          <span className="scene-bar__tile-caption">
            {design.fileName.length > 14
              ? `${design.fileName.slice(0, 12)}…`
              : design.fileName}
          </span>
          <button
            type="button"
            className="scene-bar__tile-remove"
            title="Remove design"
            onClick={() => clearDesign()}
          >
            ×
          </button>
        </div>
      )}

      <div className="scene-bar__spacer" />

      <button
        type="button"
        className="scene-bar__action"
        disabled={!showBody}
        title="Reset body placement"
        onClick={() => resetAnatomyTransform()}
      >
        Reset body
      </button>
      <button
        type="button"
        className={`scene-bar__action scene-bar__action--stimulus${
          placing ? " is-active" : ""
        }`}
        disabled={!canPlace}
        aria-pressed={placing}
        title={
          placing
            ? "Stimulus mode on — click once on the body, then mode turns off"
            : "Add one stimulus plane (click body once)"
        }
        onClick={() => {
          if (placing) {
            setTool("translate");
            return;
          }
          setSidebarTab("contacts");
          setTool("contact");
        }}
      >
        Stimulus
      </button>
      <button
        type="button"
        className={`scene-bar__action scene-bar__action--run${
          contactCount > 0 ? " is-ready" : ""
        }${running ? " is-running" : ""}`}
        disabled={!canRun}
        title={
          contactCount === 0
            ? "Place a stimulus plane first"
            : running
              ? "Simulation running…"
              : "Run simulation for placed contacts"
        }
        onClick={() => void runSimulation()}
      >
        {running ? "Solving…" : "Run"}
      </button>
    </div>
  );
}
