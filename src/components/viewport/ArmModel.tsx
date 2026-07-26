import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  MeshPhysicalMaterial,
  type Mesh,
} from "three";
import { createSkinMaps } from "../../lib/skinTexture";
import { sampleSeriesAtTime, temperatureColor } from "../../lib/thermal";
import { useExperimentStore } from "../../store/experimentStore";

// Forearm proportions (scene units). The crest of the arm is placed at y = 0 so
// the existing contact/placement math — which snaps designs onto the y = 0
// plane — is unchanged; the anatomy renders below that plane.
const ARM_RADIUS = 1.3;
const ARM_X0 = -1.9; // elbow end
const ARM_X1 = 1.7; // wrist end
const SEG_X = 72;
const SEG_THETA = 56;

const RADIUS_BONE = 0.24;
const ULNA_BONE = 0.26;
const MAX_DENT_SCENE = 0.4; // visual scale for the indentation animation

/** A forearm surface as an X-axis tube so the crest (θ=0) sits at local +Y. */
function buildForearmGeometry(): BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= SEG_X; i += 1) {
    const fx = i / SEG_X;
    const x = ARM_X0 + (ARM_X1 - ARM_X0) * fx;
    // Gentle taper toward the wrist for a more natural silhouette.
    const r = ARM_RADIUS * (1 - 0.16 * fx);
    for (let j = 0; j <= SEG_THETA; j += 1) {
      const theta = (j / SEG_THETA) * Math.PI * 2;
      const y = r * Math.cos(theta);
      const z = r * Math.sin(theta);
      positions.push(x, y, z);
      uvs.push(fx * 4, (j / SEG_THETA) * 2);
    }
  }

  const row = SEG_THETA + 1;
  for (let i = 0; i < SEG_X; i += 1) {
    for (let j = 0; j < SEG_THETA; j += 1) {
      const a = i * row + j;
      const b = a + row;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }

  const geo = new BufferGeometry();
  const pos = new Float32Array(positions);
  geo.setAttribute("position", new BufferAttribute(pos, 3));
  geo.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  // Keep an untouched copy so denting is always applied to the rest shape.
  geo.userData.base = pos.slice();
  return geo;
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

/** The forearm skin, deformed in real time by the mechanical indentation. */
function DeformableForearm({
  geometry,
  material,
}: {
  geometry: BufferGeometry;
  material: MeshPhysicalMaterial;
}) {
  const meshRef = useRef<Mesh>(null);
  const lastDepth = useRef(-1);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const state = useExperimentStore.getState();
    const mech = state.mechanicsResult;

    let depthScene = 0;
    let sigma = 0.35;
    if (mech && state.simulationStatus === "complete" && mech.contacts.length > 0) {
      const contact = mech.contacts.reduce((a, b) =>
        b.summary.peakIndentationUm > a.summary.peakIndentationUm ? b : a,
      );
      const peak = Math.max(contact.summary.peakIndentationUm, 1);
      const indent =
        sampleSeriesAtTime(contact.indentationSeries, state.playbackTimeS, "indentationUm") ?? 0;
      depthScene = (indent / peak) * MAX_DENT_SCENE;
      sigma = Math.max(0.22, Math.min(0.9, Math.sqrt(contact.inputs.contactAreaMm2 / Math.PI) / 31.5));
    }

    if (Math.abs(depthScene - lastDepth.current) < 0.0004) return;
    lastDepth.current = depthScene;

    const pos = geometry.attributes.position as BufferAttribute;
    const base = geometry.userData.base as Float32Array;
    const twoSigmaSq = 2 * sigma * sigma;
    for (let v = 0; v < pos.count; v += 1) {
      const bx = base[v * 3];
      const by = base[v * 3 + 1];
      const bz = base[v * 3 + 2];
      // Distance from the crest contact (x = 0, θ = 0): along length + arc.
      const theta = Math.atan2(bz, by);
      const arc = ARM_RADIUS * theta;
      const dist2 = bx * bx + arc * arc;
      const fall = depthScene > 0 ? Math.exp(-dist2 / twoSigmaSq) : 0;
      const rad = Math.hypot(by, bz) || 1;
      const push = depthScene * fall;
      pos.setXYZ(v, bx, by - (by / rad) * push, bz - (bz / rad) * push);
    }
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
  });

  return <mesh ref={meshRef} geometry={geometry} material={material} castShadow receiveShadow />;
}

function ActiveHeatSpot({ gradient }: { gradient: CanvasTexture }) {
  const matRef = useRef<MeshPhysicalMaterial>(null);
  const meshRef = useRef<Mesh>(null);
  const baseColor = useMemo(() => new Color(), []);

  useFrame(() => {
    const mat = matRef.current;
    const mesh = meshRef.current;
    if (!mat || !mesh) return;
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
    <mesh ref={meshRef} position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={3}>
      <circleGeometry args={[1.0, 56]} />
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

function Finger({
  position,
  length,
  radius,
  rotation = [0, 0, 0],
  material,
}: {
  position: [number, number, number];
  length: number;
  radius: number;
  rotation?: [number, number, number];
  material: MeshPhysicalMaterial;
}) {
  return (
    <mesh position={position} rotation={rotation} material={material} castShadow>
      <capsuleGeometry args={[radius, length, 10, 20]} />
    </mesh>
  );
}

export function ArmModel() {
  const showAnatomy = useExperimentStore((s) => s.showAnatomy);
  const maps = useMemo(() => createSkinMaps(1024), []);
  const gradient = useMemo(() => radialGradientTexture(), []);
  const geometry = useMemo(() => buildForearmGeometry(), []);

  const skin = useMemo(() => {
    const m = new MeshPhysicalMaterial({
      map: maps.map,
      roughnessMap: maps.roughnessMap,
      normalMap: maps.normalMap,
      roughness: 0.72,
      metalness: 0.0,
      sheen: 0.5,
      sheenColor: new Color("#c9704f"),
      sheenRoughness: 0.7,
      clearcoat: 0.08,
      clearcoatRoughness: 0.6,
      side: DoubleSide,
    });
    m.normalScale.set(0.8, 0.8);
    return m;
  }, [maps]);

  useLayoutEffect(() => {
    skin.transparent = showAnatomy;
    skin.opacity = showAnatomy ? 0.3 : 1;
    skin.depthWrite = !showAnatomy;
    skin.needsUpdate = true;
  }, [showAnatomy, skin]);

  useLayoutEffect(
    () => () => {
      maps.dispose();
      gradient.dispose();
      geometry.dispose();
      skin.dispose();
    },
    [maps, gradient, geometry, skin],
  );

  // Hand sits just past the wrist; palm crest kept a little below the forearm.
  const handX = ARM_X1 + 0.55;

  return (
    <group name="ArmModel" position={[0, -ARM_RADIUS, 0]}>
      <DeformableForearm geometry={geometry} material={skin} />

      {/* Elbow cap so the tube is not hollow at the near end. */}
      <mesh position={[ARM_X0, 0, 0]} material={skin}>
        <sphereGeometry args={[ARM_RADIUS, 32, 24]} />
      </mesh>

      {/* Wrist + hand. */}
      <mesh position={[ARM_X1 + 0.05, -0.12, 0]} material={skin} castShadow>
        <sphereGeometry args={[ARM_RADIUS * 0.82, 28, 20]} />
      </mesh>
      <group position={[handX, -0.18, 0]}>
        <RoundedBox args={[1.0, 0.55, 1.5]} radius={0.22} smoothness={4} castShadow>
          <primitive object={skin} attach="material" />
        </RoundedBox>
        {/* Four fingers. */}
        <Finger position={[0.95, 0.02, 0.52]} length={0.85} radius={0.15} rotation={[0, 0, -Math.PI / 2]} material={skin} />
        <Finger position={[1.02, 0.02, 0.18]} length={0.95} radius={0.15} rotation={[0, 0, -Math.PI / 2]} material={skin} />
        <Finger position={[1.0, 0.02, -0.16]} length={0.9} radius={0.15} rotation={[0, 0, -Math.PI / 2]} material={skin} />
        <Finger position={[0.9, 0.02, -0.5]} length={0.72} radius={0.14} rotation={[0, 0, -Math.PI / 2]} material={skin} />
        {/* Thumb. */}
        <Finger position={[0.35, 0.0, 0.72]} length={0.55} radius={0.16} rotation={[Math.PI / 2.4, 0, -Math.PI / 3]} material={skin} />
      </group>

      {showAnatomy && (
        <group name="ArmAnatomy">
          <mesh position={[0, -0.18, 0.42]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <capsuleGeometry args={[RADIUS_BONE, ARM_X1 - ARM_X0 + 1.2, 16, 28]} />
            <meshStandardMaterial color="#efe7d2" roughness={0.55} metalness={0.02} />
          </mesh>
          <mesh position={[0, -0.18, -0.42]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <capsuleGeometry args={[ULNA_BONE, ARM_X1 - ARM_X0 + 1.2, 16, 28]} />
            <meshStandardMaterial color="#efe7d2" roughness={0.55} metalness={0.02} />
          </mesh>
          {/* Hand bones. */}
          {[0.52, 0.18, -0.16, -0.5].map((z, i) => (
            <mesh
              key={i}
              position={[handX + 0.2, -0.18, z]}
              rotation={[0, 0, Math.PI / 2]}
              castShadow
            >
              <capsuleGeometry args={[0.07, 0.9, 8, 14]} />
              <meshStandardMaterial color="#efe7d2" roughness={0.55} />
            </mesh>
          ))}
        </group>
      )}

      {/* Data-driven responses on the crest (world y = 0). */}
      <group position={[0, ARM_RADIUS, 0]}>
        <ActiveHeatSpot gradient={gradient} />
      </group>
    </group>
  );
}
