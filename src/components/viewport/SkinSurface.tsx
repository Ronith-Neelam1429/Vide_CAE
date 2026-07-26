import { useLayoutEffect, useMemo } from "react";
import { DoubleSide, EdgesGeometry, PlaneGeometry } from "three";
import { createSkinMaps } from "../../lib/skinTexture";

/** Finite tissue patch — not an infinite ground plane. */
export const SKIN_SIZE = 4;

export function SkinSurface() {
  const maps = useMemo(() => createSkinMaps(512), []);
  const edgeGeometry = useMemo(
    () => new EdgesGeometry(new PlaneGeometry(SKIN_SIZE, SKIN_SIZE)),
    [],
  );

  useLayoutEffect(
    () => () => {
      maps.dispose();
      edgeGeometry.dispose();
    },
    [maps, edgeGeometry],
  );

  return (
    <group name="SkinSurface">
      {/* Soft subsurface slab for a bit of tissue thickness */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]} receiveShadow>
        <planeGeometry args={[SKIN_SIZE, SKIN_SIZE]} />
        <meshStandardMaterial
          color="#c48b72"
          roughness={0.95}
          metalness={0}
          side={DoubleSide}
        />
      </mesh>

      <mesh
        name="SkinPatch"
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.001, 0]}
        receiveShadow
        castShadow
      >
        <planeGeometry args={[SKIN_SIZE, SKIN_SIZE, 64, 64]} />
        <meshStandardMaterial
          map={maps.map}
          roughnessMap={maps.roughnessMap}
          roughness={0.82}
          metalness={0.02}
          envMapIntensity={0.15}
          side={DoubleSide}
        />
      </mesh>

      <lineSegments
        geometry={edgeGeometry}
        position={[0, 0.002, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <lineBasicMaterial color="#8a5a48" transparent opacity={0.9} />
      </lineSegments>
    </group>
  );
}
