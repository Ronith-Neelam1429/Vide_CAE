import { TransformControls } from "@react-three/drei";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Group,
  Matrix4,
  MeshStandardMaterial,
  Vector3,
  type Mesh,
  type Object3D,
} from "three";
import { loadCadObject } from "../../lib/cadImport";
import { useExperimentStore, type Vec3 } from "../../store/experimentStore";
import { ContactMarkers } from "./ContactMarkers";
import { usePlaneDrag, type PlaneDragMode } from "./usePlaneDrag";

const designMaterial = new MeshStandardMaterial({
  color: "#7d8894",
  metalness: 0.28,
  roughness: 0.42,
});

function dragModeForTool(
  tool: ReturnType<typeof useExperimentStore.getState>["tool"],
): PlaneDragMode | null {
  if (tool === "translate") return "translate";
  if (tool === "rotate") return "rotate";
  return null;
}

function toVec3(v: Vector3): Vec3 {
  return [v.x, v.y, v.z];
}

export function ImportedDesign() {
  const design = useExperimentStore((s) => s.design);
  const tool = useExperimentStore((s) => s.tool);
  const transformEpoch = useExperimentStore((s) => s.transformEpoch);
  const setTransform = useExperimentStore((s) => s.setTransform);
  const setImportError = useExperimentStore((s) => s.setImportError);
  const addContactPoint = useExperimentStore((s) => s.addContactPoint);

  const { gl } = useThree();
  const pivotRef = useRef<Group>(null);
  const [pivot, setPivot] = useState<Group | null>(null);
  const suppressWrite = useRef(false);
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);

  const dragMode = dragModeForTool(tool);
  const { onPointerDown, onPointerOver, onPointerOut } = usePlaneDrag(
    pivotRef,
    dragMode,
  );

  useEffect(() => {
    if (tool !== "contact") return;
    const previous = gl.domElement.style.cursor;
    gl.domElement.style.cursor = "crosshair";
    return () => {
      gl.domElement.style.cursor = previous;
    };
  }, [tool, gl]);

  const parsed = useMemo(() => {
    if (!design) {
      return { content: null as Group | null, error: null as string | null };
    }
    try {
      return { content: loadCadObject(design.bytes, design.kind), error: null };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to parse CAD file.";
      return { content: null, error: message };
    }
  }, [design]);

  const content = parsed.content;

  useEffect(() => {
    setImportError(parsed.error);
  }, [parsed.error, setImportError]);

  useEffect(() => {
    return () => {
      content?.traverse((obj) => {
        const mesh = obj as Mesh;
        if (mesh.isMesh) mesh.geometry.dispose();
      });
    };
  }, [content]);

  useLayoutEffect(() => {
    if (!content) return;
    content.traverse((obj: Object3D) => {
      const mesh = obj as Mesh;
      if (mesh.isMesh) {
        mesh.material = designMaterial;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
  }, [content, design?.id]);

  useLayoutEffect(() => {
    const node = pivotRef.current;
    if (!node || !content) return;

    const { position, rotation, scale } = useExperimentStore.getState();
    suppressWrite.current = true;
    node.position.set(...position);
    node.rotation.set(...rotation);
    node.scale.set(...scale);
    suppressWrite.current = false;
  }, [transformEpoch, content]);

  useLayoutEffect(() => {
    if (pivotRef.current) setPivot(pivotRef.current);
  }, [content, design?.id]);

  if (!design || !content) return null;

  const showGizmo =
    pivot !== null &&
    (tool === "translate" || tool === "rotate" || tool === "scale");

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    pointerDownPos.current = { x: event.clientX, y: event.clientY };
    if (tool !== "contact") {
      onPointerDown(event);
    } else {
      event.stopPropagation();
    }
  };

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    if (tool !== "contact") return;

    // Ignore click if the pointer moved (orbit / accidental drag).
    const down = pointerDownPos.current;
    if (down) {
      const dx = event.clientX - down.x;
      const dy = event.clientY - down.y;
      if (dx * dx + dy * dy > 16) return;
    }

    const node = pivotRef.current;
    if (!node) return;

    event.stopPropagation();
    node.updateWorldMatrix(true, true);

    const localPosition = node.worldToLocal(event.point.clone());

    const worldNormal = new Vector3();
    if (event.normal) {
      worldNormal.copy(event.normal);
    } else if (event.face) {
      worldNormal
        .copy(event.face.normal)
        .transformDirection(event.object.matrixWorld);
    } else {
      worldNormal.set(0, 1, 0);
    }

    const inverse = new Matrix4().copy(node.matrixWorld).invert();
    const localNormal = worldNormal
      .clone()
      .transformDirection(inverse)
      .normalize();

    // Nudge slightly along the normal so the marker sits on the outside.
    localPosition.addScaledVector(localNormal, 0.01);

    addContactPoint({
      position: toVec3(localPosition),
      normal: toVec3(localNormal),
    });
  };

  return (
    <>
      <group
        ref={pivotRef}
        name="DesignPivot"
        onPointerDown={handlePointerDown}
        onPointerOver={tool === "contact" ? undefined : onPointerOver}
        onPointerOut={tool === "contact" ? undefined : onPointerOut}
        onClick={handleClick}
      >
        <primitive object={content} />
        <ContactMarkers />
      </group>

      {showGizmo && (
        <TransformControls
          object={pivot}
          mode={tool}
          size={0.9}
          onObjectChange={() => {
            const node = pivotRef.current;
            if (!node || suppressWrite.current) return;
            setTransform({
              position: [node.position.x, node.position.y, node.position.z],
              rotation: [node.rotation.x, node.rotation.y, node.rotation.z],
              scale: [node.scale.x, node.scale.y, node.scale.z],
            });
          }}
        />
      )}
    </>
  );
}
