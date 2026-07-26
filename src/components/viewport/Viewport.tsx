import { Canvas } from "@react-three/fiber";
import { Suspense, useEffect, useRef } from "react";
import { useExperimentStore } from "../../store/experimentStore";
import { Scene } from "./Scene";

export function Viewport() {
  const paneRef = useRef<HTMLElement>(null);
  const design = useExperimentStore((s) => s.design);
  const tool = useExperimentStore((s) => s.tool);
  const contactCount = useExperimentStore((s) => s.contactPoints.length);

  useEffect(() => {
    const el = paneRef.current;
    if (!el) return;

    const blockContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    el.addEventListener("contextmenu", blockContextMenu);
    return () => el.removeEventListener("contextmenu", blockContextMenu);
  }, []);

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

      <div className="viewport-overlay">
        <div className="viewport-overlay__coords">
          {design
            ? `${design.fileName}${contactCount ? ` · ${contactCount} CP` : ""}`
            : "Skin patch · 4 × 4"}
        </div>
        <div className="viewport-overlay__hint">
          {design && tool === "contact" ? (
            <>
              <span className="viewport-chip">
                <strong>Click mesh</strong> add contact
              </span>
              <span className="viewport-chip">
                <strong>Click marker</strong> select
              </span>
              <span className="viewport-chip">
                <strong>Empty drag</strong> orbit
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
