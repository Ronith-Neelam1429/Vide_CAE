import { Canvas } from "@react-three/fiber";
import { Suspense, useEffect, useRef } from "react";
import { useExperimentStore } from "../../store/experimentStore";
import { Scene } from "./Scene";

export function Viewport() {
  const paneRef = useRef<HTMLElement>(null);
  const design = useExperimentStore((s) => s.design);
  const tool = useExperimentStore((s) => s.tool);

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
          {design ? `Design · ${design.fileName}` : "Skin patch · 4 × 4"}
        </div>
        <div className="viewport-overlay__hint">
          {design && tool !== "orbit" ? (
            <>
              <span className="viewport-chip">
                <strong>Gizmo</strong> {tool}
              </span>
              <span className="viewport-chip">
                <strong>Orbit tool</strong> free camera
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
