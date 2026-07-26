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
      <div className="sidebar__tree-row">
        <span className="sidebar__tree-dot" style={{ background: "#d4a08a" }} />
        <span className="sidebar__tree-label">Skin surface (4 × 4)</span>
      </div>
      {!design && (
        <div className="sidebar__tree-row">
          <span className="sidebar__tree-dot" />
          <span className="sidebar__tree-label">Placeholder Cube</span>
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
  const contactCount = useExperimentStore((s) => s.contactPoints.length);
  const simulationStatus = useExperimentStore((s) => s.simulationStatus);

  const openTab = (tab: SidebarTab) => {
    setSidebarTab(tab);
    if (tab === "contacts" && design) {
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
      : design
        ? "Design ready · place contacts next"
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
            disabled={!design}
          >
            Contacts
          </button>
          <button
            type="button"
            className={`sidebar__tab${sidebarTab === "results" ? " is-active" : ""}`}
            onClick={() => openTab("results")}
            disabled={!design}
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
