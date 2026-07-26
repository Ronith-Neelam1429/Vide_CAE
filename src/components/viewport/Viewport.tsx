import { Canvas } from "@react-three/fiber";
import { Suspense, useEffect, useRef } from "react";
import { Scene } from "./Scene";

export function Viewport() {
  const paneRef = useRef<HTMLElement>(null);

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
          camera={{ position: [4.5, 3.2, 5.5], fov: 45, near: 0.01, far: 500 }}
        >
          <Suspense fallback={null}>
            <Scene />
          </Suspense>
        </Canvas>
      </div>

      <div className="viewport-overlay">
        <div className="viewport-overlay__coords">World · Origin</div>
        <div className="viewport-overlay__hint">
          <span className="viewport-chip">
            <strong>Drag</strong> orbit
          </span>
          <span className="viewport-chip">
            <strong>⌥/Alt + drag</strong> pan
          </span>
          <span className="viewport-chip">
            <strong>Scroll</strong> zoom
          </span>
        </div>
      </div>
    </section>
  );
}
