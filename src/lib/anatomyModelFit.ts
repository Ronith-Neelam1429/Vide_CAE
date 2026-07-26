import {
  Box3,
  Group,
  type Material,
  type Mesh,
  type Object3D,
  Vector3,
} from "three";
import type { AnatomyLimbId } from "./anatomyLimbs";
import {
  anatomyMeshKind,
  FOREARM_OVERLAY_MESH,
  pickMeshVariants,
} from "./anatomyAssets";

/** Standing height in scene units — sized to read well in the default camera. */
const TARGET_HEIGHT = 14;

export type AnatomyLayout = {
  /** Model-local point on the volar forearm used for heat overlays. */
  forearmOverlay: Vector3;
  /** Invisible drag target wrapping the fitted body. */
  pickCenter: Vector3;
  pickSize: Vector3;
  /** Pivot groups for per-limb posing (shoulder / hip joints). */
  limbs: Record<AnatomyLimbId, Group>;
};

function classifyLimb(center: Vector3, bounds: Box3): AnatomyLimbId {
  const size = bounds.getSize(new Vector3());
  if (size.y < 1e-6 || size.x < 1e-6) return "torso";

  const relY = (center.y - bounds.min.y) / size.y;
  const relX = (center.x - bounds.min.x) / size.x;

  if (relY > 0.86) return "head";
  if (relY > 0.54) {
    if (relX < 0.38) return "leftArm";
    if (relX > 0.62) return "rightArm";
    return "torso";
  }
  if (relY > 0.36 && relX > 0.34 && relX < 0.66) return "torso";
  if (relX < 0.5) return "leftLeg";
  return "rightLeg";
}

function pivotForLimb(limb: AnatomyLimbId, bounds: Box3): Vector3 {
  const size = bounds.getSize(new Vector3());
  const center = bounds.getCenter(new Vector3());
  const y = bounds.min.y;

  switch (limb) {
    case "head":
      return new Vector3(center.x, bounds.min.y + size.y * 0.86, center.z);
    case "leftArm":
      return new Vector3(bounds.min.x + size.x * 0.34, bounds.min.y + size.y * 0.72, center.z);
    case "rightArm":
      return new Vector3(bounds.min.x + size.x * 0.66, bounds.min.y + size.y * 0.72, center.z);
    case "leftLeg":
      return new Vector3(bounds.min.x + size.x * 0.38, y + size.y * 0.48, center.z);
    case "rightLeg":
      return new Vector3(bounds.min.x + size.x * 0.62, y + size.y * 0.48, center.z);
    default:
      return center.clone();
  }
}

function reparentIntoLimbs(content: Group, keepers: Set<Object3D>, bounds: Box3): Record<AnatomyLimbId, Group> {
  const limbs = {
    torso: new Group(),
    head: new Group(),
    leftArm: new Group(),
    rightArm: new Group(),
    leftLeg: new Group(),
    rightLeg: new Group(),
  } satisfies Record<AnatomyLimbId, Group>;

  (Object.entries(limbs) as [AnatomyLimbId, Group][]).forEach(([id, group]) => {
    group.name = `AnatomyLimb_${id}`;
    const pivot = pivotForLimb(id, bounds);
    group.position.copy(pivot);
    content.add(group);
  });

  const meshCenter = new Vector3();
  for (const obj of keepers) {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) continue;

    new Box3().setFromObject(mesh).getCenter(meshCenter);
    const limb = classifyLimb(meshCenter, bounds);
    mesh.userData.videLimb = limb;

    const parent = mesh.parent;
    if (!parent) continue;

    parent.remove(mesh);
    limbs[limb].attach(mesh);
  }

  return limbs;
}

/**
 * Prepare the complete body: deduplicate LOD variants, tag anatomy meshes,
 * group limbs under joint pivots, and stand the model on the ground plane.
 */
export function prepareFullBodyAnatomy(root: Object3D): AnatomyLayout {
  const meshNames: string[] = [];
  root.traverse((child) => {
    const mesh = child as Mesh;
    if (mesh.isMesh) meshNames.push(mesh.name);
  });

  const keepNames = pickMeshVariants(meshNames);
  const keepers = new Set<Object3D>();
  const forearmOverlay = new Vector3(0.9, 4.5, 0.35);
  const pickCenter = new Vector3();
  const pickSize = new Vector3(1, TARGET_HEIGHT, 1);
  const content = new Group();
  content.name = "AnatomyContent";
  root.add(content);

  root.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    const keep = keepNames.has(mesh.name);
    mesh.visible = keep;
    if (!keep) return;

    mesh.userData.videAnatomy = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const kind = anatomyMeshKind(mesh.userData as Record<string, unknown>);
    if (kind === "bone") {
      mesh.visible = false;
    }

    keepers.add(mesh);
  });

  for (const mesh of keepers) {
    const parent = (mesh as Mesh).parent;
    if (parent) parent.remove(mesh as Mesh);
    content.add(mesh as Mesh);
  }

  const bounds = new Box3();
  content.updateMatrixWorld(true);
  keepers.forEach((mesh) => bounds.expandByObject(mesh));

  let limbs: Record<AnatomyLimbId, Group> = {
    torso: content,
    head: content,
    leftArm: content,
    rightArm: content,
    leftLeg: content,
    rightLeg: content,
  };

  if (!bounds.isEmpty()) {
    const center = bounds.getCenter(new Vector3());
    content.position.sub(center);

    content.updateMatrixWorld(true);
    const centered = new Box3();
    keepers.forEach((mesh) => centered.expandByObject(mesh));

    const size = centered.getSize(new Vector3());
    const scale = TARGET_HEIGHT / Math.max(size.y, 1e-6);
    content.scale.setScalar(scale);

    content.updateMatrixWorld(true);
    const fitted = new Box3();
    keepers.forEach((mesh) => fitted.expandByObject(mesh));
    content.position.y -= fitted.min.y;

    content.updateMatrixWorld(true);
    const fittedBounds = new Box3();
    keepers.forEach((mesh) => fittedBounds.expandByObject(mesh));

    limbs = reparentIntoLimbs(content, keepers, fittedBounds);

    fittedBounds.getSize(pickSize);
    fittedBounds.getCenter(pickCenter);
    root.worldToLocal(pickCenter);

    const radiusMesh = [...keepers].find((mesh) =>
      FOREARM_OVERLAY_MESH.test((mesh as Mesh).name),
    ) as Mesh | undefined;
    if (radiusMesh) {
      const local = new Vector3();
      radiusMesh.getWorldPosition(local);
      root.worldToLocal(local);
      forearmOverlay.copy(local);
    }
  }

  return { forearmOverlay, pickCenter, pickSize, limbs };
}

export function applyAnatomyVisibility(
  root: Object3D,
  showAnatomy: boolean,
  materialCache: Map<string, Material>,
): void {
  root.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh || !mesh.userData.videAnatomy) return;

    const kind = anatomyMeshKind(mesh.userData as Record<string, unknown>);
    if (kind === "bone") {
      mesh.visible = showAnatomy;
      return;
    }

    if (kind !== "muscle" && kind !== "other") return;

    mesh.visible = true;
    if (kind !== "muscle") return;
    let mat = materialCache.get(mesh.uuid);
    if (!mat) {
      mat = mesh.material instanceof Array ? mesh.material[0].clone() : mesh.material.clone();
      materialCache.set(mesh.uuid, mat);
      mesh.material = mat;
    }

    mat.transparent = showAnatomy;
    mat.opacity = showAnatomy ? 0.28 : 1;
    mat.depthWrite = !showAnatomy;
    mat.needsUpdate = true;
  });
}

export function applyAnatomyLimbRotations(
  limbs: Record<AnatomyLimbId, Group>,
  rotations: Partial<Record<AnatomyLimbId, [number, number, number]>>,
): void {
  (Object.entries(rotations) as [AnatomyLimbId, [number, number, number]][]).forEach(
    ([limb, rotation]) => {
      const group = limbs[limb];
      if (!group) return;
      group.rotation.set(...rotation);
    },
  );
}
