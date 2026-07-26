import { DESIGN_PRESETS, makePresetDesign } from "../../lib/designPresets";
import { importDesignFromDisk } from "../../lib/importDesign";
import {
  useExperimentStore,
  type SidebarTab,
  type Vec3,
} from "../../store/experimentStore";
import { ContactsPanel } from "../sidebar/ContactsPanel";
import { ResultsPanel } from "../sidebar/ResultsPanel";

function formatVec(v: Vec3, digits = 2): string {
  return v.map((n) => n.toFixed(digits)).join(", ");
}

function toDegrees(radians: Vec3): Vec3 {
  const k = 180 / Math.PI;
  return [radians[0] * k, radians[1] * k, radians[2] * k];
}

function DesignPanel() {
  const design = useExperimentStore((s) => s.design);
  const position = useExperimentStore((s) => s.position);
  const rotation = useExperimentStore((s) => s.rotation);
  const scale = useExperimentStore((s) => s.scale);
  const isImporting = useExperimentStore((s) => s.isImporting);
  const importError = useExperimentStore((s) => s.importError);
  const contactCount = useExperimentStore((s) => s.contactPoints.length);
  const clearDesign = useExperimentStore((s) => s.clearDesign);
  const resetTransform = useExperimentStore((s) => s.resetTransform);
  const setSidebarTab = useExperimentStore((s) => s.setSidebarTab);
  const setTool = useExperimentStore((s) => s.setTool);
  const setDesign = useExperimentStore((s) => s.setDesign);
  const showBody = useExperimentStore((s) => s.showBody);
  const toggleShowBody = useExperimentStore((s) => s.toggleShowBody);
  const resetAnatomyTransform = useExperimentStore((s) => s.resetAnatomyTransform);
  const anatomyPosition = useExperimentStore((s) => s.anatomyPosition);
  const anatomyRotation = useExperimentStore((s) => s.anatomyRotation);
  const anatomyScale = useExperimentStore((s) => s.anatomyScale);

  return (
    <>
      <div className="sidebar__section-label">Document</div>
      <div className="sidebar__actions">
        <button
          type="button"
          className="sidebar__btn sidebar__btn--primary"
          disabled={isImporting}
          onClick={() => void importDesignFromDisk()}
        >
          {isImporting ? "Importing…" : "Import STL / OBJ"}
        </button>
        {design && (
          <button
            type="button"
            className="sidebar__btn"
            onClick={() => clearDesign()}
          >
            Remove design
          </button>
        )}
      </div>

      {importError && (
        <div className="sidebar__error" role="alert">
          {importError}
        </div>
      )}

      <div className="sidebar__section-label" style={{ paddingLeft: 0, marginTop: 12 }}>
        Arm-worn presets
      </div>
      <div className="sidebar__actions">
        {DESIGN_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="preset-btn"
            title={preset.description}
            onClick={() => setDesign(makePresetDesign(preset))}
          >
            <span className="preset-btn__label">{preset.label}</span>
            <span className="preset-btn__desc">{preset.description}</span>
          </button>
        ))}
      </div>

      {design ? (
        <>
          <div className="sidebar__tree-row is-selected" style={{ marginTop: 10 }}>
            <span className="sidebar__tree-dot" />
            <span className="sidebar__tree-label" title={design.fileName}>
              {design.fileName}
            </span>
          </div>
          <div className="sidebar__meta-line">
            Format · {design.kind.toUpperCase()} · {contactCount} contacts
          </div>

          <div className="sidebar__section-label" style={{ paddingLeft: 0 }}>
            Placement
          </div>
          <div className="sidebar__readout">
            <div>
              <span>Position</span>
              <code>{formatVec(position)}</code>
            </div>
            <div>
              <span>Rotation°</span>
              <code>{formatVec(toDegrees(rotation), 1)}</code>
            </div>
            <div>
              <span>Scale</span>
              <code>{formatVec(scale)}</code>
            </div>
          </div>
          <button
            type="button"
            className="sidebar__btn"
            style={{ marginTop: 8 }}
            onClick={() => resetTransform()}
          >
            Reset placement
          </button>

          <button
            type="button"
            className="sidebar__btn sidebar__btn--primary"
            style={{ marginTop: 8 }}
            onClick={() => {
              setSidebarTab("contacts");
              setTool("contact");
            }}
          >
            Place contact points
          </button>
        </>
      ) : (
        <div className="sidebar__empty" style={{ marginTop: 12 }}>
          <div className="sidebar__empty-title">No design imported</div>
          <p className="sidebar__empty-copy">
            Import an STL or OBJ mesh, place it against the skin patch, then
            mark contact points and assign stimuli.
          </p>
        </div>
      )}

      <div
        className="sidebar__section-label"
        style={{ paddingLeft: 0, marginTop: 16 }}
      >
        Scene
      </div>
      <div className="sidebar__actions">
        <button
          type="button"
          className={`sidebar__btn${showBody ? "" : " sidebar__btn--primary"}`}
          onClick={() => toggleShowBody()}
        >
          {showBody ? "Hide human body" : "Render human body"}
        </button>
      </div>
      {showBody ? (
        <>
          <div className="sidebar__tree-row is-selected" style={{ marginTop: 10 }}>
            <span className="sidebar__tree-dot" style={{ background: "#d4a08a" }} />
            <span className="sidebar__tree-label">Z-Anatomy human body</span>
          </div>
          <div className="sidebar__meta-line">Bones & muscles · CC BY-SA 4.0</div>
          <div className="sidebar__section-label" style={{ paddingLeft: 0 }}>
            Body placement
          </div>
          <div className="sidebar__readout">
            <div>
              <span>Position</span>
              <code>{formatVec(anatomyPosition)}</code>
            </div>
            <div>
              <span>Rotation°</span>
              <code>{formatVec(toDegrees(anatomyRotation), 1)}</code>
            </div>
            <div>
              <span>Scale</span>
              <code>{formatVec(anatomyScale)}</code>
            </div>
          </div>
          <button
            type="button"
            className="sidebar__btn"
            style={{ marginTop: 8 }}
            onClick={() => resetAnatomyTransform()}
          >
            Reset body placement
          </button>
          <button
            type="button"
            className="sidebar__btn sidebar__btn--primary"
            style={{ marginTop: 8 }}
            onClick={() => {
              setSidebarTab("contacts");
              setTool("contact");
            }}
          >
            Add stimulus plane
          </button>
        </>
      ) : (
        <div className="sidebar__empty" style={{ marginTop: 10 }}>
          <p className="sidebar__empty-copy">
            Render the human body to inspect anatomy, pose limbs, and place
            devices against skin.
          </p>
        </div>
      )}
    </>
  );
}

export function Sidebar() {
  const sidebarTab = useExperimentStore((s) => s.sidebarTab);
  const setSidebarTab = useExperimentStore((s) => s.setSidebarTab);
  const setTool = useExperimentStore((s) => s.setTool);
  const design = useExperimentStore((s) => s.design);
  const showBody = useExperimentStore((s) => s.showBody);
  const contactCount = useExperimentStore((s) => s.contactPoints.length);
  const simulationStatus = useExperimentStore((s) => s.simulationStatus);

  const openTab = (tab: SidebarTab) => {
    setSidebarTab(tab);
    if (tab === "contacts" && (design || showBody)) {
      setTool("contact");
    }
  };

  const resultsFooter =
    simulationStatus === "running"
      ? "Solving bioheat equation…"
      : simulationStatus === "error"
        ? "Run failed · see the message above"
        : simulationStatus === "complete"
          ? "Research prototype · verification only, not validated"
          : "Heat-only research simulation";

  const footer =
    sidebarTab === "contacts"
      ? contactCount > 0
        ? `${contactCount} contact${contactCount === 1 ? "" : "s"} · assign stimuli`
        : "Click the mesh to add contacts"
      : sidebarTab === "results"
        ? resultsFooter
        : design || showBody
          ? "Surface ready · place a stimulus"
        : "Ready · import a mesh to begin";

  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <span className="sidebar__header-title">Browser</span>
        <div className="sidebar__tabs">
          <button
            type="button"
            className={`sidebar__tab${sidebarTab === "design" ? " is-active" : ""}`}
            onClick={() => openTab("design")}
          >
            Design
          </button>
          <button
            type="button"
            className={`sidebar__tab${sidebarTab === "contacts" ? " is-active" : ""}`}
            onClick={() => openTab("contacts")}
            disabled={!design && !showBody}
          >
            Contacts
          </button>
          <button
            type="button"
            className={`sidebar__tab${sidebarTab === "results" ? " is-active" : ""}`}
            onClick={() => openTab("results")}
            disabled={contactCount === 0}
          >
            Results
          </button>
        </div>
      </div>

      <section className="sidebar__section">
        <div className="sidebar__body">
          {sidebarTab === "design" ? (
            <DesignPanel />
          ) : sidebarTab === "contacts" ? (
            <ContactsPanel />
          ) : (
            <ResultsPanel />
          )}
        </div>
      </section>

      <div className="sidebar__footer">{footer}</div>
    </aside>
  );
}
