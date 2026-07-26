import { useExperimentStore } from "../../store/experimentStore";

export function StatusBar() {
  const design = useExperimentStore((s) => s.design);
  const tool = useExperimentStore((s) => s.tool);
  const importError = useExperimentStore((s) => s.importError);

  return (
    <footer className="status-bar">
      <div className="status-bar__left">
        <span className="status-bar__item">
          <span className="status-bar__dot" aria-hidden />
          {importError
            ? "Import error"
            : design
              ? design.fileName
              : "Viewport ready"}
        </span>
        <span className="status-bar__item">Units: mm</span>
        <span className="status-bar__item">Tool: {tool}</span>
      </div>
      <div className="status-bar__right">
        <span className="status-bar__item status-bar__mono">Drag orbit</span>
        <span className="status-bar__item status-bar__mono">⌥ pan</span>
        <span className="status-bar__item status-bar__mono">Gizmo move/rotate</span>
      </div>
    </footer>
  );
}
