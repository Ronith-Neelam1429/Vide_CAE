import { Canvas } from "@react-three/fiber";
import { Suspense, useEffect, useRef, useState } from "react";
import { useExperimentStore, type Vec3 } from "../../store/experimentStore";
import { AnatomyAttributionPanel } from "./AnatomyAttributionPanel";
import { Scene } from "./Scene";
import { ViewportTools } from "./ViewportTools";

function formatVec(v: Vec3, digits = 2): string {
  return v.map((n) => n.toFixed(digits)).join(", ");
}

function toDegrees(radians: Vec3): Vec3 {
  const k = 180 / Math.PI;
  return [radians[0] * k, radians[1] * k, radians[2] * k];
}

export function Viewport() {
  const paneRef = useRef<HTMLElement>(null);
  const design = useExperimentStore((s) => s.design);
  const tool = useExperimentStore((s) => s.tool);
  const contactCount = useExperimentStore((s) => s.contactPoints.length);
  const showAnatomy = useExperimentStore((s) => s.showAnatomy);
  const showBody = useExperimentStore((s) => s.showBody);
  const toggleAnatomy = useExperimentStore((s) => s.toggleAnatomy);
  const anatomyPosition = useExperimentStore((s) => s.anatomyPosition);
  const anatomyRotation = useExperimentStore((s) => s.anatomyRotation);
  const anatomyScale = useExperimentStore((s) => s.anatomyScale);
  const designPosition = useExperimentStore((s) => s.position);
  const designRotation = useExperimentStore((s) => s.rotation);
  const designScale = useExperimentStore((s) => s.scale);
  const [showAttribution, setShowAttribution] = useState(false);
  const [showPosition, setShowPosition] = useState(false);

  useEffect(() => {
    const el = paneRef.current;
    if (!el) return;

    const blockContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    el.addEventListener("contextmenu", blockContextMenu);
    return () => el.removeEventListener("contextmenu", blockContextMenu);
  }, []);

  const canShowPosition = showBody || design !== null;

  return (
    <section ref={paneRef} className="viewport-pane" aria-label="3D viewport">
      <div className="viewport-pane__canvas">
        <Canvas
          shadows
          dpr={[1, 2]}
          gl={{
            antialias: true,
            alpha: false,
            powerPreference: "high-performance",
          }}
          camera={{ position: [4.8, 3.4, 5.8], fov: 45, near: 0.01, far: 500 }}
        >
          <Suspense fallback={null}>
            <Scene />
          </Suspense>
        </Canvas>
      </div>

      <ViewportTools />

      <div className="viewport-overlay">
        <div className="viewport-overlay__coords">
          {design
            ? `${design.fileName}${contactCount ? ` · ${contactCount} CP` : ""}`
            : showBody
              ? "Z-Anatomy full body · bones & muscles"
              : "Empty scene · show Body from the scene bar"}
        </div>

        <div className="viewport-overlay__actions">
          {showBody && (
            <button
              type="button"
              className={`viewport-toggle${showAnatomy ? " is-active" : ""}`}
              onClick={toggleAnatomy}
            >
              {showAnatomy ? "Hide anatomy" : "Show anatomy"}
            </button>
          )}
          {showBody && (
            <button
              type="button"
              className={`viewport-toggle viewport-toggle--muted${
                showAttribution ? " is-active" : ""
              }`}
              onClick={() => {
                setShowAttribution((open) => !open);
                setShowPosition(false);
              }}
            >
              Anatomy credit
            </button>
          )}
          {canShowPosition && (
            <div className="viewport-position">
              <button
                type="button"
                className={`viewport-toggle viewport-toggle--muted${
                  showPosition ? " is-active" : ""
                }`}
                onClick={() => {
                  setShowPosition((open) => !open);
                  setShowAttribution(false);
                }}
              >
                Position
              </button>
              {showPosition && (
                <div className="viewport-position__panel">
                  {showBody && (
                    <div className="viewport-position__block">
                      <span className="viewport-position__label">Body</span>
                      <pre className="viewport-position__values">
                        {`Pos  ${formatVec(anatomyPosition)}
Rot° ${formatVec(toDegrees(anatomyRotation), 1)}
Scale ${formatVec(anatomyScale)}`}
                      </pre>
                    </div>
                  )}
                  {design && (
                    <div className="viewport-position__block">
                      <span className="viewport-position__label">Design</span>
                      <pre className="viewport-position__values">
                        {`Pos  ${formatVec(designPosition)}
Rot° ${formatVec(toDegrees(designRotation), 1)}
Scale ${formatVec(designScale)}`}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <AnatomyAttributionPanel
            open={showAttribution}
            onClose={() => setShowAttribution(false)}
          />
        </div>
        <div className="viewport-overlay__hint">
          {tool === "contact" ? (
            <>
              <span className="viewport-chip">
                <strong>Click once</strong> place stimulus
              </span>
              <span className="viewport-chip">
                <strong>Then</strong> back to move
              </span>
            </>
          ) : design && tool === "translate" ? (
            <>
              <span className="viewport-chip">
                <strong>Drag object</strong> move
              </span>
              <span className="viewport-chip">
                <strong>Gizmo</strong> precise move
              </span>
            </>
          ) : design && tool === "rotate" ? (
            <>
              <span className="viewport-chip">
                <strong>Drag object</strong> spin
              </span>
              <span className="viewport-chip">
                <strong>Gizmo</strong> precise rotate
              </span>
            </>
          ) : design && tool === "scale" ? (
            <>
              <span className="viewport-chip">
                <strong>Gizmo</strong> scale
              </span>
            </>
          ) : tool === "translate" ? (
            <>
              <span className="viewport-chip">
                <strong>Drag body</strong> move
              </span>
              <span className="viewport-chip">
                <strong>Gizmo</strong> precise move
              </span>
            </>
          ) : tool === "rotate" ? (
            <>
              <span className="viewport-chip">
                <strong>Drag body</strong> spin
              </span>
              <span className="viewport-chip">
                <strong>Click limb</strong> pose joint
              </span>
            </>
          ) : tool === "scale" ? (
            <>
              <span className="viewport-chip">
                <strong>Gizmo</strong> scale body
              </span>
            </>
          ) : (
            <>
              <span className="viewport-chip">
                <strong>Drag</strong> orbit
              </span>
              <span className="viewport-chip">
                <strong>⌥/Alt + drag</strong> pan
              </span>
              <span className="viewport-chip">
                <strong>Scroll</strong> zoom
              </span>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
