import { useMemo } from "react";
import { Quaternion, Vector3 } from "three";
import { useExperimentStore, type Vec3 } from "../../store/experimentStore";

const MARKER_RADIUS = 0.045;
const Y_UP = new Vector3(0, 1, 0);

function NormalTick({ normal, color }: { normal: Vec3; color: string }) {
  const quaternion = useMemo(() => {
    const n = new Vector3(normal[0], normal[1], normal[2]);
    if (n.lengthSq() < 1e-10) return new Quaternion();
    n.normalize();
    return new Quaternion().setFromUnitVectors(Y_UP, n);
  }, [normal]);

  return (
    <group quaternion={quaternion}>
      <mesh position={[0, MARKER_RADIUS + 0.045, 0]}>
        <cylinderGeometry args={[0.007, 0.007, 0.09, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} />
      </mesh>
      <mesh position={[0, MARKER_RADIUS + 0.1, 0]}>
        <coneGeometry args={[0.018, 0.04, 10]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} />
      </mesh>
    </group>
  );
}

export function ContactMarkers() {
  const contactPoints = useExperimentStore((s) => s.contactPoints);
  const selectedContactId = useExperimentStore((s) => s.selectedContactId);
  const selectContact = useExperimentStore((s) => s.selectContact);

  return (
    <group name="ContactMarkers">
      {contactPoints.map((contact) => {
        const selected = contact.id === selectedContactId;
        const color = selected ? "#ffb020" : "#22d3ee";

        return (
          <group
            key={contact.id}
            position={contact.position}
            name={contact.label}
          >
            <mesh
              onClick={(event) => {
                event.stopPropagation();
                selectContact(contact.id);
              }}
            >
              <sphereGeometry args={[MARKER_RADIUS, 20, 20]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={selected ? 0.55 : 0.28}
                roughness={0.35}
                metalness={0.1}
              />
            </mesh>

            <NormalTick normal={contact.normal} color={color} />

            {selected && (
              <mesh scale={1.6}>
                <sphereGeometry args={[MARKER_RADIUS, 16, 16]} />
                <meshBasicMaterial
                  color={color}
                  transparent
                  opacity={0.16}
                  depthWrite={false}
                />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}
