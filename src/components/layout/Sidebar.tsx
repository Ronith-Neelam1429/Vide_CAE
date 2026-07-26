import { importDesignFromDisk } from "../../lib/importDesign";
import { useExperimentStore, type Vec3 } from "../../store/experimentStore";

function formatVec(v: Vec3, digits = 2): string {
  return v.map((n) => n.toFixed(digits)).join(", ");
}

function toDegrees(radians: Vec3): Vec3 {
  const k = 180 / Math.PI;
  return [radians[0] * k, radians[1] * k, radians[2] * k];
}

export function Sidebar() {
  const design = useExperimentStore((s) => s.design);
  const position = useExperimentStore((s) => s.position);
  const rotation = useExperimentStore((s) => s.rotation);
  const scale = useExperimentStore((s) => s.scale);
  const isImporting = useExperimentStore((s) => s.isImporting);
  const importError = useExperimentStore((s) => s.importError);
  const clearDesign = useExperimentStore((s) => s.clearDesign);
  const resetTransform = useExperimentStore((s) => s.resetTransform);

  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <span className="sidebar__header-title">Browser</span>
        <div className="sidebar__tabs">
          <button type="button" className="sidebar__tab is-active">
            Design
          </button>
          <button type="button" className="sidebar__tab" disabled>
            Stimuli
          </button>
        </div>
      </div>

      <section className="sidebar__section">
        <div className="sidebar__section-label">Document</div>
        <div className="sidebar__body">
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
                Format · {design.kind.toUpperCase()}
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
            </>
          ) : (
            <div className="sidebar__empty" style={{ marginTop: 12 }}>
              <div className="sidebar__empty-title">No design imported</div>
              <p className="sidebar__empty-copy">
                Import an STL or OBJ mesh, then use Move / Rotate / Scale to
                position it against the skin patch before defining contact
                points.
              </p>
            </div>
          )}

          <div className="sidebar__section-label" style={{ paddingLeft: 0, marginTop: 16 }}>
            Scene
          </div>
          <div className="sidebar__tree-row">
            <span
              className="sidebar__tree-dot"
              style={{ background: "#d4a08a" }}
            />
            <span className="sidebar__tree-label">Skin surface (4 × 4)</span>
          </div>
          {!design && (
            <div className="sidebar__tree-row">
              <span className="sidebar__tree-dot" />
              <span className="sidebar__tree-label">Placeholder Cube</span>
            </div>
          )}
        </div>
      </section>

      <div className="sidebar__footer">
        {design ? "Design ready for placement" : "Ready · import a mesh to begin"}
      </div>
    </aside>
  );
}
