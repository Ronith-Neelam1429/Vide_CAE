import { useMemo } from "react";
import { DoubleSide, Quaternion, Vector3 } from "three";
import { useExperimentStore, type ContactPoint } from "../../store/experimentStore";

const Z_AXIS = new Vector3(0, 0, 1);

function planeSize(areaMm2: number | undefined): number {
  // The fitted body is about 8 scene units per metre. Preserve physical
  // proportions while keeping very small default contacts selectable.
  return Math.max(0.12, Math.sqrt(areaMm2 ?? 100) * 0.008);
}

function StimulusPlane({
  contact,
  areaMm2,
  selected,
}: {
  contact: ContactPoint;
  areaMm2: number | undefined;
  selected: boolean;
}) {
  const quaternion = useMemo(() => {
    const normal = new Vector3(...contact.normal);
    if (normal.lengthSq() < 1e-10) return new Quaternion();
    return new Quaternion().setFromUnitVectors(Z_AXIS, normal.normalize());
  }, [contact.normal]);

  const position = useMemo(() => {
    const normal = new Vector3(...contact.normal).normalize();
    return new Vector3(...contact.position).addScaledVector(normal, 0.018);
  }, [contact.normal, contact.position]);

  const selectContact = useExperimentStore((s) => s.selectContact);
  const size = planeSize(areaMm2);
  const color = selected ? "#ffb020" : "#22d3ee";

  return (
    <group position={position} quaternion={quaternion} name={`${contact.label}_stimulus`}>
      <mesh
        onClick={(event) => {
          event.stopPropagation();
          selectContact(contact.id);
        }}
      >
        <planeGeometry args={[size, size]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={selected ? 0.65 : 0.3}
          transparent
          opacity={0.78}
          side={DoubleSide}
          roughness={0.28}
          metalness={0.12}
        />
      </mesh>
      <mesh position={[0, 0, 0.002]}>
        <ringGeometry args={[size * 0.34, size * 0.4, 32]} />
        <meshBasicMaterial color="#fff7df" transparent opacity={0.9} side={DoubleSide} />
      </mesh>
    </group>
  );
}

export function BodyStimulusPlanes() {
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
          <StimulusPlane
            key={contact.id}
            contact={contact}
            areaMm2={areaMm2}
            selected={contact.id === selectedContactId}
          />
        );
      })}
    </group>
  );
}
