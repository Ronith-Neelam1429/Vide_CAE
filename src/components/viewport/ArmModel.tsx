import { TransformControls, useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import {
  CanvasTexture,
  Color,
  Group,
  type Material,
  Matrix4,
  MeshPhysicalMaterial,
  type Mesh,
  Vector3,
} from "three";
import { ANATOMY_MODEL_URL } from "../../lib/anatomyAssets";
import type { AnatomyLimbId } from "../../lib/anatomyLimbs";
import {
  applyAnatomyLimbRotations,
  applyAnatomyVisibility,
  prepareFullBodyAnatomy,
} from "../../lib/anatomyModelFit";
import { sampleSeriesAtTime, temperatureColor } from "../../lib/thermal";
import { useExperimentStore, type Vec3 } from "../../store/experimentStore";
import { BodyStimulusPlanes } from "./BodyStimulusPlanes";
import { usePlaneDrag, type PlaneDragMode } from "./usePlaneDrag";

useGLTF.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
useGLTF.preload(ANATOMY_MODEL_URL, true);

function dragModeForTool(
  tool: ReturnType<typeof useExperimentStore.getState>["tool"],
): PlaneDragMode | null {
  if (tool === "translate") return "translate";
  if (tool === "rotate") return "rotate";
  return null;
}

function radialGradientTexture(): CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.5, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}

function ActiveHeatSpot({
  gradient,
  anchor,
}: {
  gradient: CanvasTexture;
  anchor: Vector3;
}) {
  const matRef = useRef<MeshPhysicalMaterial>(null);
  const meshRef = useRef<Mesh>(null);
  const baseColor = useMemo(() => new Color(), []);

  useFrame(() => {
    const mat = matRef.current;
    const mesh = meshRef.current;
    if (!mat || !mesh) return;
    mesh.position.copy(anchor);
    mesh.position.y += 0.012;

    const state = useExperimentStore.getState();
    const result = state.simulationResult;
    if (!result || state.simulationStatus !== "complete" || result.contacts.length === 0) {
      mesh.visible = false;
      return;
    }
    const hot = result.contacts.reduce((a, b) =>
      b.summary.peakSurfaceTemperatureC > a.summary.peakSurfaceTemperatureC ? b : a,
    );
    const baseline = hot.inputs.baselineSkinTemperatureC;
    const temp =
      sampleSeriesAtTime(hot.series, state.playbackTimeS, "surfaceTemperatureC") ?? baseline;
    const intensity = Math.max(0, Math.min(1, (temp - baseline) / (55 - baseline)));
    mesh.visible = intensity > 0.01;
    mat.color.copy(temperatureColor(temp, baseline, baseColor));
    mat.opacity = 0.25 + intensity * 0.6;
  });

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} renderOrder={3}>
      <circleGeometry args={[0.45, 56]} />
      <meshPhysicalMaterial
        ref={matRef}
        map={gradient}
        alphaMap={gradient}
        transparent
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

function limbFromIntersection(object: Mesh): AnatomyLimbId | null {
  if (object.userData.videLimb) {
    return object.userData.videLimb as AnatomyLimbId;
  }
  let found: AnatomyLimbId | null = null;
  object.traverseAncestors((ancestor) => {
    if (found) return;
    if (ancestor.userData.videLimb) {
      found = ancestor.userData.videLimb as AnatomyLimbId;
    }
  });
  return found;
}

export function ArmModel() {
  const { raycaster } = useThree();
  const showAnatomy = useExperimentStore((s) => s.showAnatomy);
  const tool = useExperimentStore((s) => s.tool);
  const anatomyPosition = useExperimentStore((s) => s.anatomyPosition);
  const anatomyRotation = useExperimentStore((s) => s.anatomyRotation);
  const anatomyScale = useExperimentStore((s) => s.anatomyScale);
  const anatomyLimbRotations = useExperimentStore((s) => s.anatomyLimbRotations);
  const selectedAnatomyLimb = useExperimentStore((s) => s.selectedAnatomyLimb);
  const anatomyTransformEpoch = useExperimentStore((s) => s.anatomyTransformEpoch);
  const setAnatomyTransform = useExperimentStore((s) => s.setAnatomyTransform);
  const setAnatomyLimbRotation = useExperimentStore((s) => s.setAnatomyLimbRotation);
  const setSelectedAnatomyLimb = useExperimentStore((s) => s.setSelectedAnatomyLimb);
  const addContactPoint = useExperimentStore((s) => s.addContactPoint);

  const { scene } = useGLTF(ANATOMY_MODEL_URL, true);
  const pivotRef = useRef<Group>(null);
  const [pivot, setPivot] = useState<Group | null>(null);
  const [limbTarget, setLimbTarget] = useState<Group | null>(null);
  const suppressWrite = useRef(false);
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);
  const materialCache = useRef(new Map<string, Material>()).current;
  const gradient = useMemo(() => radialGradientTexture(), []);

  const dragMode = tool === "contact" || tool === "orbit" || tool === "scale" ? null : dragModeForTool(tool);
  const { onPointerDown, onPointerOver, onPointerOut } = usePlaneDrag(pivotRef, dragMode, {
    syncStore: false,
    onTransform: (partial) => {
      setSelectedAnatomyLimb(null);
      setAnatomyTransform(partial);
    },
  });

  const { model, forearmOverlay, pickCenter, pickSize, limbs } = useMemo(() => {
    const clone = scene.clone(true);
    const layout = prepareFullBodyAnatomy(clone);
    return { model: clone, ...layout };
  }, [scene]);

  useLayoutEffect(() => {
    applyAnatomyVisibility(model, showAnatomy, materialCache);
  }, [showAnatomy, model, materialCache]);

  useLayoutEffect(() => {
    applyAnatomyLimbRotations(limbs, anatomyLimbRotations);
  }, [limbs, anatomyLimbRotations, anatomyTransformEpoch]);

  useLayoutEffect(() => {
    const node = pivotRef.current;
    if (!node) return;
    suppressWrite.current = true;
    node.position.set(...anatomyPosition);
    node.rotation.set(...anatomyRotation);
    node.scale.set(...anatomyScale);
    suppressWrite.current = false;
  }, [anatomyPosition, anatomyRotation, anatomyScale, anatomyTransformEpoch]);

  useLayoutEffect(() => {
    if (pivotRef.current) setPivot(pivotRef.current);
  }, [model]);

  useLayoutEffect(() => {
    if (tool === "rotate" && selectedAnatomyLimb) {
      setLimbTarget(limbs[selectedAnatomyLimb] ?? null);
    } else {
      setLimbTarget(null);
    }
  }, [tool, selectedAnatomyLimb, limbs]);

  useLayoutEffect(
    () => () => {
      gradient.dispose();
      materialCache.forEach((mat) => mat.dispose());
      materialCache.clear();
    },
    [gradient, materialCache],
  );

  const showBodyGizmo =
    pivot !== null &&
    limbTarget === null &&
    (tool === "translate" || tool === "rotate" || tool === "scale");

  const showLimbGizmo = limbTarget !== null && tool === "rotate";

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    pointerDownPos.current = { x: event.clientX, y: event.clientY };
    if (tool === "contact" || tool === "orbit") return;
    event.stopPropagation();
    onPointerDown(event);
  };

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    if (tool === "contact") {
      const down = pointerDownPos.current;
      if (down) {
        const dx = event.clientX - down.x;
        const dy = event.clientY - down.y;
        if (dx * dx + dy * dy > 16) return;
      }

      const node = pivotRef.current;
      if (!node) return;
      node.updateWorldMatrix(true, true);

      // The transparent proxy receives the R3F event. Raycast the actual
      // anatomy meshes again to anchor the stimulus plane to the clicked skin.
      const hit = raycaster
        .intersectObject(model, true)
        .find((candidate) => (candidate.object as Mesh).userData.videAnatomy);
      if (!hit) return;

      const localPosition = node.worldToLocal(hit.point.clone());
      const worldNormal = hit.face
        ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
        : new Vector3(0, 1, 0);
      const localNormal = worldNormal
        .transformDirection(new Matrix4().copy(node.matrixWorld).invert())
        .normalize();
      localPosition.addScaledVector(localNormal, 0.012);

      const hitMesh = hit.object as Mesh;
      const limb = limbFromIntersection(hitMesh);

      event.stopPropagation();
      addContactPoint({
        position: [localPosition.x, localPosition.y, localPosition.z],
        normal: [localNormal.x, localNormal.y, localNormal.z],
        surface: "body",
        anatomyMeshName: hitMesh.name || null,
        anatomyLimbId: limb,
      });
      return;
    }

    if (tool !== "rotate") return;
    event.stopPropagation();

    const anatomyHit = event.intersections.find((hit) => {
      const mesh = hit.object as Mesh;
      return mesh.isMesh && mesh.userData.videAnatomy;
    });
    const target = (anatomyHit?.object ?? event.object) as Mesh;
    const limb = limbFromIntersection(target);
    if (limb && limb !== "torso") {
      setSelectedAnatomyLimb(limb);
    }
  };

  return (
    <>
      <group ref={pivotRef} name="AnatomyPivot">
        <primitive object={model} />
        <ActiveHeatSpot gradient={gradient} anchor={forearmOverlay} />
        <BodyStimulusPlanes />

        {/* Invisible pick volume — GLTF child meshes don't receive R3F events reliably. */}
        <mesh
          name="AnatomyPickProxy"
          position={pickCenter}
          visible={false}
          onPointerDown={handlePointerDown}
          onPointerOver={onPointerOver}
          onPointerOut={onPointerOut}
          onClick={handleClick}
        >
          <boxGeometry args={[pickSize.x, pickSize.y, pickSize.z]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>

      {showBodyGizmo && (
        <TransformControls
          object={pivot}
          mode={tool}
          size={1.1}
          onMouseDown={() => {
            setSelectedAnatomyLimb(null);
          }}
          onObjectChange={() => {
            const node = pivotRef.current;
            if (!node || suppressWrite.current) return;
            setAnatomyTransform({
              position: [node.position.x, node.position.y, node.position.z],
              rotation: [node.rotation.x, node.rotation.y, node.rotation.z],
              scale: [node.scale.x, node.scale.y, node.scale.z],
            });
          }}
        />
      )}

      {showLimbGizmo && limbTarget && (
        <TransformControls
          object={limbTarget}
          mode="rotate"
          size={0.85}
          onObjectChange={() => {
            if (!selectedAnatomyLimb) return;
            setAnatomyLimbRotation(selectedAnatomyLimb, [
              limbTarget.rotation.x,
              limbTarget.rotation.y,
              limbTarget.rotation.z,
            ] as Vec3);
          }}
        />
      )}
    </>
  );
}
