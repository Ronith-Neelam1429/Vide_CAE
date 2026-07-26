import type { Vec3 } from "../store/experimentStore";

export type AnatomyLimbId =
  | "torso"
  | "head"
  | "leftArm"
  | "rightArm"
  | "leftLeg"
  | "rightLeg";

export const ANATOMY_LIMB_LABELS: Record<AnatomyLimbId, string> = {
  torso: "Torso",
  head: "Head",
  leftArm: "Left arm",
  rightArm: "Right arm",
  leftLeg: "Left leg",
  rightLeg: "Right leg",
};

export type AnatomyLimbRotations = Partial<Record<AnatomyLimbId, Vec3>>;
