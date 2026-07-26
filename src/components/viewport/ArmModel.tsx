import { useLayoutEffect, useMemo } from "react";
import { DoubleSide } from "three";
import { createSkinMaps } from "../../lib/skinTexture";
import { sampleSeriesAtTime, temperatureColor } from "../../lib/thermal";
import { useExperimentStore } from "../../store/experimentStore";

// Forearm proportions (scene units). The crest of the arm is placed at y = 0 so
// the existing contact/placement math — which snaps designs onto the y = 0
// plane — is unchanged; the anatomy simply renders below that plane.
// Segment length and radius follow adult forearm anthropometry (circumference
// ~26 cm -> radius ~4.1 cm; we show a mid-forearm segment).
const ARM_RADIUS = 1.3;
const ARM_LENGTH = 3.2; // cylindrical span of the capsule (caps add 2*radius)

// Radius and ulna: two long bones, ~15-16 mm diameter, sitting toward the
// dorsal/posterior side of the forearm.
const RADIUS_BONE = 0.24;
const ULNA_BONE = 0.26;

function ActiveHeatSpot() {
  const result = useExperimentStore((s) => s.simulationResult);
  const status = useExperimentStore((s) => s.simulationStatus);
  const playbackTimeS = useExperimentStore((s) => s.playbackTimeS);

  const hot = useMemo(() => {
    if (!result || result.contacts.length === 0) return null;
    // Show the worst-case contact so the hot spot reads clearly.
    return result.contacts.reduce((a, b) =>
      b.summary.peakSurfaceTemperatureC > a.summary.peakSurfaceTemperatureC ? b : a,
    );
  }, [result]);

  if (!hot || status !== "complete") return null;

  const baseline = hot.inputs.baselineSkinTemperatureC;
  const temp =
    sampleSeriesAtTime(hot.series, playbackTimeS, "surfaceTemperatureC") ?? baseline;
  const color = temperatureColor(temp, baseline);
  const intensity = Math.max(0, Math.min(1, (temp - baseline) / (55 - baseline)));

  // A soft glow disc on the crest marking where the 1D model deposits heat.
  return (
    <mesh position={[0, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
      <circleGeometry args={[0.9, 48]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.15 + intensity * 0.6}
        depthWrite={false}
      />
    </mesh>
  );
}

export function ArmModel() {
  const showAnatomy = useExperimentStore((s) => s.showAnatomy);
  const maps = useMemo(() => createSkinMaps(512), []);

  useLayoutEffect(() => () => maps.dispose(), [maps]);

  const skinOpacity = showAnatomy ? 0.28 : 1;

  return (
    <group name="ArmModel" position={[0, -ARM_RADIUS, 0]}>
      {/* Skin: full forearm capsule laid along X. */}
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <capsuleGeometry args={[ARM_RADIUS, ARM_LENGTH, 24, 48]} />
        <meshStandardMaterial
          map={maps.map}
          roughnessMap={maps.roughnessMap}
          roughness={0.82}
          metalness={0.02}
          envMapIntensity={0.15}
          transparent={showAnatomy}
          opacity={skinOpacity}
          side={DoubleSide}
        />
      </mesh>

      {showAnatomy && (
        <group name="ArmAnatomy">
          {/* Subcutaneous fat shell. */}
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <capsuleGeometry args={[ARM_RADIUS * 0.9, ARM_LENGTH, 16, 36]} />
            <meshStandardMaterial
              color="#e8c98a"
              roughness={0.9}
              transparent
              opacity={0.4}
              side={DoubleSide}
            />
          </mesh>
          {/* Muscle bulk. */}
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <capsuleGeometry args={[ARM_RADIUS * 0.78, ARM_LENGTH, 16, 36]} />
            <meshStandardMaterial
              color="#a8443f"
              roughness={0.85}
              transparent
              opacity={0.55}
              side={DoubleSide}
            />
          </mesh>
          {/* Radius and ulna. */}
          <mesh position={[0, -0.18, 0.42]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[RADIUS_BONE, RADIUS_BONE, ARM_LENGTH + 1.4, 24]} />
            <meshStandardMaterial color="#efe7d2" roughness={0.6} metalness={0.02} />
          </mesh>
          <mesh position={[0, -0.18, -0.42]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[ULNA_BONE, ULNA_BONE, ARM_LENGTH + 1.4, 24]} />
            <meshStandardMaterial color="#efe7d2" roughness={0.6} metalness={0.02} />
          </mesh>
        </group>
      )}

      {/* Responses live on the crest (world y = 0). */}
      <group position={[0, ARM_RADIUS, 0]}>
        <ActiveHeatSpot />
        <ActiveMechSpot />
      </group>
    </group>
  );
}

function ActiveMechSpot() {
  const mechanics = useExperimentStore((s) => s.mechanicsResult);
  const status = useExperimentStore((s) => s.simulationStatus);
  const playbackTimeS = useExperimentStore((s) => s.playbackTimeS);

  const contact = useMemo(() => {
    if (!mechanics || mechanics.contacts.length === 0) return null;
    return mechanics.contacts.reduce((a, b) =>
      b.summary.peakIndentationUm > a.summary.peakIndentationUm ? b : a,
    );
  }, [mechanics]);

  if (!contact || status !== "complete") return null;

  const indentUm =
    sampleSeriesAtTime(contact.indentationSeries, playbackTimeS, "indentationUm") ?? 0;
  // Exaggerate for visibility: map the peak indentation to ~0.3 scene units.
  const peak = Math.max(contact.summary.peakIndentationUm, 1);
  const depthScene = (indentUm / peak) * 0.3;

  // Contact radius from the area (1 scene unit ≈ 31.5 mm of forearm).
  const areaMm2 = contact.inputs.contactAreaMm2;
  const radiusScene = Math.min(0.9, Math.sqrt(areaMm2 / Math.PI) / 31.5);

  return (
    <mesh position={[0, 0.02 - depthScene, 0]} castShadow>
      <cylinderGeometry args={[radiusScene, radiusScene * 0.96, 0.12, 40]} />
      <meshStandardMaterial color="#5b8dd6" metalness={0.3} roughness={0.5} />
    </mesh>
  );
}
