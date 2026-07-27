import { useEffect, useMemo } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  Raycaster,
  Vector3,
} from "three";
import { useExperimentStore, type ContactPoint } from "../../store/experimentStore";

const PATCH_SEGMENTS = 12;
const SURFACE_OFFSET = 0.014;
const RAY_START_OFFSET = 0.35;
const FALLBACK_AXIS = new Vector3(1, 0, 0);
const UP_AXIS = new Vector3(0, 1, 0);

function planeSize(areaMm2: number | undefined): number {
  // The fitted body is about 8 scene units per metre. Preserve physical
  // proportions while keeping very small default contacts selectable.
  return Math.max(0.12, Math.sqrt(areaMm2 ?? 100) * 0.008);
}

function buildConformingPatch(
  contact: ContactPoint,
  size: number,
  anatomyRoot: Group,
): BufferGeometry {
  anatomyRoot.updateWorldMatrix(true, true);

  const center = new Vector3(...contact.position);
  const normal = new Vector3(...contact.normal).normalize();
  const tangent = new Vector3().crossVectors(UP_AXIS, normal);
  if (tangent.lengthSq() < 1e-8) tangent.crossVectors(FALLBACK_AXIS, normal);
  tangent.normalize();
  const bitangent = new Vector3().crossVectors(normal, tangent).normalize();
  const raycaster = new Raycaster();
  const vertices: number[] = [];
  const indices: number[] = [];
  const gridSize = PATCH_SEGMENTS + 1;

  for (let row = 0; row <= PATCH_SEGMENTS; row += 1) {
    for (let column = 0; column <= PATCH_SEGMENTS; column += 1) {
      const u = (column / PATCH_SEGMENTS - 0.5) * size;
      const v = (row / PATCH_SEGMENTS - 0.5) * size;
      const sample = center
        .clone()
        .addScaledVector(tangent, u)
        .addScaledVector(bitangent, v);
      const worldStart = anatomyRoot.localToWorld(
        sample.clone().addScaledVector(normal, RAY_START_OFFSET),
      );
      const worldDirection = normal
        .clone()
        .negate()
        .transformDirection(anatomyRoot.matrixWorld)
        .normalize();

      raycaster.set(worldStart, worldDirection);
      const hit = raycaster
        .intersectObject(anatomyRoot, true)
        .find((candidate) => candidate.object.userData.videAnatomy);

      if (hit) {
        const localPoint = anatomyRoot.worldToLocal(hit.point.clone());
        const localNormal = hit.face
          ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
          : normal.clone();
        localNormal
          .transformDirection(anatomyRoot.matrixWorld.clone().invert())
          .normalize();
        localPoint.addScaledVector(localNormal, SURFACE_OFFSET);
        vertices.push(localPoint.x, localPoint.y, localPoint.z);
      } else {
        // Keep a complete patch at sharp edges or between anatomy meshes.
        sample.addScaledVector(normal, SURFACE_OFFSET);
        vertices.push(sample.x, sample.y, sample.z);
      }
    }
  }

  for (let row = 0; row < PATCH_SEGMENTS; row += 1) {
    for (let column = 0; column < PATCH_SEGMENTS; column += 1) {
      const a = row * gridSize + column;
      const b = a + 1;
      const c = a + gridSize;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(vertices), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function StimulusPatch({
  contact,
  areaMm2,
  selected,
  anatomyRoot,
}: {
  contact: ContactPoint;
  areaMm2: number | undefined;
  selected: boolean;
  anatomyRoot: Group;
}) {
  const selectContact = useExperimentStore((s) => s.selectContact);
  const size = planeSize(areaMm2);
  const color = selected ? "#ffb020" : "#22d3ee";
  const geometry = useMemo(
    () => buildConformingPatch(contact, size, anatomyRoot),
    [anatomyRoot, contact, size],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh
      geometry={geometry}
      name={`${contact.label}_stimulus`}
      renderOrder={2}
      onClick={(event) => {
        event.stopPropagation();
        selectContact(contact.id);
      }}
    >
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={selected ? 0.65 : 0.3}
        transparent
        opacity={0.78}
        side={DoubleSide}
        roughness={0.28}
        metalness={0.12}
        depthWrite={false}
      />
    </mesh>
  );
}

export function BodyStimulusPlanes({ anatomyRoot }: { anatomyRoot: Group }) {
  const contactPoints = useExperimentStore((s) => s.contactPoints);
  const assignments = useExperimentStore((s) => s.assignments);
  const selectedContactId = useExperimentStore((s) => s.selectedContactId);
  const bodyContacts = contactPoints.filter((contact) => contact.surface === "body");

  return (
    <group name="BodyStimulusPlanes">
      {bodyContacts.map((contact) => {
        const areaMm2 = assignments.find(
          (assignment) => assignment.contactPointId === contact.id,
        )?.parameters.contactAreaMm2;
        return (
          <StimulusPatch
            key={contact.id}
            contact={contact}
            areaMm2={areaMm2}
            selected={contact.id === selectedContactId}
            anatomyRoot={anatomyRoot}
          />
        );
      })}
    </group>
  );
}
