import { useThree } from "@react-three/fiber";
import { useCallback, useEffect, useRef, type RefObject } from "react";
import {
  Plane,
  Raycaster,
  Vector2,
  Vector3,
  type Group,
} from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useExperimentStore, type Vec3 } from "../../store/experimentStore";

export type PlaneDragMode = "translate" | "rotate";

type R3FPointerEvent = {
  button: number;
  clientX: number;
  stopPropagation: () => void;
  ray: { intersectPlane: (plane: Plane, target: Vector3) => Vector3 | null };
};

/**
 * Trackpad/mouse drag on a mesh:
 * - translate: slide on a horizontal plane (keeps height)
 * - rotate: drag sideways to spin around Y
 */
type PlaneDragOptions = {
  /** When false, drag mutates the object only (no experiment store writes). */
  syncStore?: boolean;
};

export function usePlaneDrag(
  pivotRef: RefObject<Group | null>,
  mode: PlaneDragMode | null,
  options: PlaneDragOptions = {},
) {
  const syncStore = options.syncStore !== false;
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls);
  const setTransform = useExperimentStore((s) => s.setTransform);

  const dragging = useRef(false);
  const plane = useRef(new Plane(new Vector3(0, 1, 0), 0));
  const hit = useRef(new Vector3());
  const offset = useRef(new Vector3());
  const lastX = useRef(0);
  const raycaster = useRef(new Raycaster());
  const pointer = useRef(new Vector2());

  const endDrag = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    const orbit = controls as OrbitControlsImpl | null;
    if (orbit) orbit.enabled = true;
    gl.domElement.style.cursor = "";
  }, [controls, gl]);

  useEffect(() => () => endDrag(), [endDrag]);

  const onPointerOver = useCallback(() => {
    if (mode && !dragging.current) {
      gl.domElement.style.cursor = "grab";
    }
  }, [mode, gl]);

  const onPointerOut = useCallback(() => {
    if (!dragging.current) {
      gl.domElement.style.cursor = "";
    }
  }, [gl]);

  const onPointerDown = useCallback(
    (event: R3FPointerEvent) => {
      if (!mode || event.button !== 0) return;
      const pivot = pivotRef.current;
      if (!pivot) return;

      event.stopPropagation();
      dragging.current = true;

      const orbit = controls as OrbitControlsImpl | null;
      if (orbit) orbit.enabled = false;
      gl.domElement.style.cursor = "grabbing";

      if (mode === "translate") {
        plane.current.set(new Vector3(0, 1, 0), -pivot.position.y);
        if (event.ray.intersectPlane(plane.current, hit.current)) {
          offset.current.copy(pivot.position).sub(hit.current);
        }
      } else {
        lastX.current = event.clientX;
      }

      const onPointerMove = (ev: PointerEvent) => {
        const node = pivotRef.current;
        if (!dragging.current || !node) return;

        if (mode === "translate") {
          const rect = gl.domElement.getBoundingClientRect();
          pointer.current.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
          pointer.current.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.current.setFromCamera(pointer.current, camera);
          plane.current.set(new Vector3(0, 1, 0), -node.position.y);

          if (raycaster.current.ray.intersectPlane(plane.current, hit.current)) {
            node.position.set(
              hit.current.x + offset.current.x,
              node.position.y,
              hit.current.z + offset.current.z,
            );
            if (syncStore) {
              setTransform({
                position: [
                  node.position.x,
                  node.position.y,
                  node.position.z,
                ] as Vec3,
              });
            }
          }
        } else {
          const dx = ev.clientX - lastX.current;
          lastX.current = ev.clientX;
          node.rotation.y += dx * 0.01;
          if (syncStore) {
            setTransform({
              rotation: [
                node.rotation.x,
                node.rotation.y,
                node.rotation.z,
              ] as Vec3,
            });
          }
        }
      };

      const onPointerUp = () => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        endDrag();
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    },
    [mode, pivotRef, controls, gl, camera, setTransform, endDrag, syncStore],
  );

  return { onPointerDown, onPointerOver, onPointerOut };
}
