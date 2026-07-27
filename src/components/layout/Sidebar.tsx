import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { importDesignFromDisk } from "../../lib/importDesign";
import {
  useExperimentStore,
  type SidebarTab,
  type Vec3,
} from "../../store/experimentStore";
import { ContactsPanel } from "../sidebar/ContactsPanel";

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
    <div className="design-panel">
      <button
        type="button"
        className="design-import-btn"
        disabled={isImporting}
        onClick={() => void importDesignFromDisk()}
      >
        <span className="design-import-btn__icon" aria-hidden>
          <svg viewBox="0 0 20 20" fill="none">
            <path
              d="M10 3v9M6.5 8.5 10 12l3.5-3.5M4 14.5v1a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 16 15.5v-1"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="design-import-btn__text">
          <strong>{isImporting ? "Importing…" : "Import STL / OBJ"}</strong>
          <span>Bring a device mesh into the scene</span>
        </span>
      </button>

      {importError && (
        <div className="sidebar__error" role="alert">
          {importError}
        </div>
      )}

      {design ? (
        <div className="design-panel__asset">
          <div className="sidebar__tree-row is-selected">
            <span className="sidebar__tree-dot" />
            <span className="sidebar__tree-label" title={design.fileName}>
              {design.fileName}
            </span>
          </div>
          <div className="sidebar__meta-line">
            {design.kind.toUpperCase()} · {contactCount} contact
            {contactCount === 1 ? "" : "s"}
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

          <div className="design-panel__row">
            <button type="button" className="sidebar__btn" onClick={() => resetTransform()}>
              Reset placement
            </button>
            <button type="button" className="sidebar__btn" onClick={() => clearDesign()}>
              Remove
            </button>
          </div>
          <button
            type="button"
            className="sidebar__btn sidebar__btn--primary"
            onClick={() => {
              setSidebarTab("contacts");
              setTool("contact");
            }}
          >
            Place contacts on design
          </button>
        </div>
      ) : (
        <p className="design-panel__hint">
          Optional. Import a device mesh, or use the Body tile in the scene bar to place
          stimuli on anatomy.
        </p>
      )}
    </div>
  );
}

export function Sidebar() {
  const sidebarTab = useExperimentStore((s) => s.sidebarTab);
  const setSidebarTab = useExperimentStore((s) => s.setSidebarTab);
  const design = useExperimentStore((s) => s.design);
  const showBody = useExperimentStore((s) => s.showBody);
  const contactCount = useExperimentStore((s) => s.contactPoints.length);
  const widthPx = useExperimentStore((s) => s.sidebarWidthPx);
  const setWidthPx = useExperimentStore((s) => s.setSidebarWidthPx);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  const openTab = (tab: SidebarTab) => {
    setSidebarTab(tab);
  };

  const footer =
    sidebarTab === "contacts"
      ? contactCount > 0
        ? `${contactCount} contact${contactCount === 1 ? "" : "s"}`
        : "Press Stimulus, then click the body once"
      : design || showBody
        ? "Drag to move · Stimulus to place"
        : "Import a mesh or show the body";

  const onResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragRef.current = { startX: event.clientX, startW: widthPx };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onResizePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    setWidthPx(dragRef.current.startW + (event.clientX - dragRef.current.startX));
  };

  const onResizePointerUp = () => {
    dragRef.current = null;
  };

  return (
    <aside className="sidebar" style={{ width: widthPx, flex: `0 0 ${widthPx}px` }}>
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
        </div>
      </div>

      <section className="sidebar__section">
        <div className="sidebar__body">
          {sidebarTab === "design" ? <DesignPanel /> : <ContactsPanel />}
        </div>
      </section>

      <div className="sidebar__footer">{footer}</div>

      <div
        className="sidebar__resize"
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
      />
    </aside>
  );
}
