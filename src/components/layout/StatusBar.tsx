import { useExperimentStore } from "../../store/experimentStore";

export function StatusBar() {
  const design = useExperimentStore((s) => s.design);
  const tool = useExperimentStore((s) => s.tool);
  const importError = useExperimentStore((s) => s.importError);
  const contactCount = useExperimentStore((s) => s.contactPoints.length);
  const selectedContactId = useExperimentStore((s) => s.selectedContactId);
  const selectedLabel = useExperimentStore((s) =>
    s.contactPoints.find((c) => c.id === s.selectedContactId)?.label,
  );

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
        {contactCount > 0 && (
          <span className="status-bar__item">
            Contacts: {contactCount}
            {selectedLabel ? ` · ${selectedLabel}` : ""}
          </span>
        )}
      </div>
      <div className="status-bar__right">
        {tool === "contact" ? (
          <>
            <span className="status-bar__item status-bar__mono">
              Click mesh to place
            </span>
            <span className="status-bar__item status-bar__mono">
              Del removes selected
            </span>
          </>
        ) : (
          <>
            <span className="status-bar__item status-bar__mono">
              C contact · G move
            </span>
            <span className="status-bar__item status-bar__mono">⌥ pan</span>
          </>
        )}
        {selectedContactId && tool !== "contact" && (
          <span className="status-bar__item status-bar__mono">
            Selected {selectedLabel}
          </span>
        )}
      </div>
    </footer>
  );
}
