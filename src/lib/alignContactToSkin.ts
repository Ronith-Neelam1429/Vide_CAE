import {
  Euler,
  Matrix3,
  Object3D,
  Quaternion,
  Vector3,
} from "three";
import type { ContactPoint, Vec3 } from "../store/experimentStore";

const SKIN_NORMAL_INWARD = new Vector3(0, -1, 0);
/** Place the touching contact at the center of the skin patch. */
const SKIN_CONTACT_TARGET = new Vector3(0, 0, 0);

export type DesignPose = {
  position: Vec3;
  rotation: Vec3;
};

/**
 * Orient the design so the given contact point sits on the skin plane (y = 0)
 * at the patch center, with its surface normal pointing into the tissue (-Y).
 */
export function computePoseForContactOnSkin(
  contact: ContactPoint,
  current: DesignPose & { scale: Vec3 },
): DesignPose {
  const pivot = new Object3D();
  pivot.position.set(...current.position);
  pivot.rotation.set(...current.rotation);
  pivot.scale.set(...current.scale);
  pivot.updateMatrixWorld(true);

  const localPos = new Vector3(...contact.position);
  const localNormal = new Vector3(...contact.normal);
  if (localNormal.lengthSq() < 1e-12) {
    localNormal.set(0, -1, 0);
  } else {
    localNormal.normalize();
  }

  const worldNormal = localNormal
    .clone()
    .applyMatrix3(new Matrix3().getNormalMatrix(pivot.matrixWorld))
    .normalize();

  // If the normal is degenerate / zero after transform, fall back.
  if (worldNormal.lengthSq() < 1e-12) {
    worldNormal.set(0, -1, 0);
  }

  const currentQuat = new Quaternion().setFromEuler(pivot.rotation);
  const alignQuat = new Quaternion().setFromUnitVectors(
    worldNormal,
    SKIN_NORMAL_INWARD,
  );
  const newQuat = alignQuat.clone().multiply(currentQuat);

  // With the new orientation at the origin, find where the contact lands,
  // then translate so it meets the skin target.
  const oriented = new Object3D();
  oriented.quaternion.copy(newQuat);
  oriented.scale.set(...current.scale);
  oriented.position.set(0, 0, 0);
  oriented.updateMatrixWorld(true);

  const contactAtOrigin = localPos.clone().applyMatrix4(oriented.matrixWorld);
  const position = SKIN_CONTACT_TARGET.clone().sub(contactAtOrigin);

  const euler = new Euler().setFromQuaternion(newQuat, "XYZ");

  return {
    position: [position.x, position.y, position.z],
    rotation: [euler.x, euler.y, euler.z],
  };
}
