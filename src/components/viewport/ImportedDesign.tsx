import { TransformControls } from "@react-three/drei";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Group, MeshStandardMaterial, type Mesh, type Object3D } from "three";
import { loadCadObject } from "../../lib/cadImport";
import { useExperimentStore } from "../../store/experimentStore";

const designMaterial = new MeshStandardMaterial({
  color: "#7d8894",
  metalness: 0.28,
  roughness: 0.42,
});

export function ImportedDesign() {
  const design = useExperimentStore((s) => s.design);
  const tool = useExperimentStore((s) => s.tool);
  const transformEpoch = useExperimentStore((s) => s.transformEpoch);
  const setTransform = useExperimentStore((s) => s.setTransform);
  const setImportError = useExperimentStore((s) => s.setImportError);

  const pivotRef = useRef<Group>(null);
  const [pivot, setPivot] = useState<Group | null>(null);
  const suppressWrite = useRef(false);

  const parsed = useMemo(() => {
    if (!design) return { content: null as Group | null, error: null as string | null };
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
    const node = pivotRef.current;
    if (!node) return;

    while (node.children.length > 0) {
      node.remove(node.children[0]);
    }

    if (!content) {
      setPivot(null);
      return;
    }

    content.traverse((obj: Object3D) => {
      const mesh = obj as Mesh;
      if (mesh.isMesh) {
        mesh.material = designMaterial;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });

    node.add(content);
    setPivot(node);
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

  if (!design || !content) {
    return (
      <group
        ref={(node) => {
          pivotRef.current = node;
        }}
        name="DesignPivot"
      />
    );
  }

  const showGizmo =
    pivot !== null &&
    (tool === "translate" || tool === "rotate" || tool === "scale");

  return (
    <>
      <group
        ref={(node) => {
          pivotRef.current = node;
          if (node && pivot !== node) setPivot(node);
        }}
        name="DesignPivot"
      />
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
