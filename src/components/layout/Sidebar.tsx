import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { SOLVER_PRESETS, type SolverPresetId } from "../../lib/simulation";
import { useExperimentStore } from "../../store/experimentStore";
import { ContactsPanel } from "../sidebar/ContactsPanel";

export function Sidebar() {
  const design = useExperimentStore((s) => s.design);
  const showBody = useExperimentStore((s) => s.showBody);
  const contactCount = useExperimentStore((s) => s.contactPoints.length);
  const widthPx = useExperimentStore((s) => s.sidebarWidthPx);
  const setWidthPx = useExperimentStore((s) => s.setSidebarWidthPx);
  const solverPreset = useExperimentStore((s) => s.solverPreset);
  const setSolverPreset = useExperimentStore((s) => s.setSolverPreset);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  const footerHint =
    contactCount > 0
      ? `${contactCount} contact${contactCount === 1 ? "" : "s"}`
      : design || showBody
        ? "Press Stimulus, then click once to place"
        : "Show Body or Import a mesh, then place a stimulus";

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
        <span className="sidebar__header-sub">Contacts</span>
      </div>

      <section className="sidebar__section">
        <div className="sidebar__body">
          <ContactsPanel />
        </div>
      </section>

      <div className="sidebar__footer sidebar__footer--accuracy">
        <label className="sidebar__accuracy">
          <span>Accuracy</span>
          <select
            className="stimulus-form__select"
            value={solverPreset}
            onChange={(event) => setSolverPreset(event.target.value as SolverPresetId)}
            title={SOLVER_PRESETS[solverPreset].description}
          >
            {Object.entries(SOLVER_PRESETS).map(([id, preset]) => (
              <option key={id} value={id}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>
        <span className="sidebar__footer-hint">{footerHint}</span>
      </div>

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
