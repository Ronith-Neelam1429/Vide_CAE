import type { AnatomyLimbId } from "./anatomyLimbs";

export type AnatomyHitInfo = {
  meshName?: string | null;
  limbId?: AnatomyLimbId | null;
  /** World or anatomy-local surface normal; used for torso front/back fallback. */
  normal?: [number, number, number] | null;
};

export type SkinProfileResolution = {
  skinProfileId: string;
  regionLabel: string;
  confidence: "high" | "medium" | "low";
  reason: string;
  meshBaseName: string | null;
};

/** Strip Blender duplicate suffixes: "Radius.001" → "Radius". */
export function anatomyMeshBaseName(meshName: string | null | undefined): string | null {
  if (!meshName) return null;
  const trimmed = meshName.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\.\d+$/, "");
}

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

/**
 * Map a body-mesh hit to the closest tabulated skin/tissue profile.
 * Mesh anatomical name is preferred; limb + normal are fallbacks.
 */
export function resolveSkinProfileFromAnatomy(
  hit: AnatomyHitInfo,
): SkinProfileResolution {
  const base = anatomyMeshBaseName(hit.meshName);
  const name = (base ?? "").toLowerCase();
  const limb = hit.limbId ?? null;

  if (name) {
    // In-vitro / non-body profiles are never inferred from anatomy.
    if (
      includesAny(name, [
        "epicanial",
        "epicranial",
        "frontalis",
        "occipitalis",
        "galea",
        "parietal bone",
        "frontal bone",
        "occipital bone",
        "temporal bone",
        "skull",
        "calvaria",
      ])
    ) {
      return {
        skinProfileId: "scalp-hair",
        regionLabel: "Scalp / skull",
        confidence: "high",
        reason: `Matched cranial mesh “${base}”`,
        meshBaseName: base,
      };
    }

    if (
      includesAny(name, [
        "rectus abdominis",
        "abdominal oblique",
        "transversus abdominis",
        "pyramidalis",
        "linea alba",
        "umbilicus",
      ])
    ) {
      return {
        skinProfileId: "abdomen",
        regionLabel: "Abdomen",
        confidence: "high",
        reason: `Matched abdominal mesh “${base}”`,
        meshBaseName: base,
      };
    }

    if (
      includesAny(name, [
        "latissimus",
        "trapezius",
        "rhomboid",
        "infraspinatus",
        "supraspinatus",
        "teres major",
        "teres minor",
        "scapula",
        "erector spinae",
        "multifidus",
      ])
    ) {
      return {
        skinProfileId: "upper-back",
        regionLabel: "Upper back",
        confidence: "high",
        reason: `Matched back/shoulder mesh “${base}”`,
        meshBaseName: base,
      };
    }

    if (
      includesAny(name, [
        "distal phalanx of",
        "fingertip",
        "nail of",
      ]) && name.includes("hand")
    ) {
      return {
        skinProfileId: "fingertip",
        regionLabel: "Fingertip",
        confidence: "high",
        reason: `Matched fingertip mesh “${base}”`,
        meshBaseName: base,
      };
    }

    if (
      includesAny(name, [
        "palmar",
        "opponens",
        "abductor pollicis",
        "abductor digiti",
        "flexor digiti minimi of hand",
        "lumbrical muscles of hand",
        "metacarpal",
        "scaphoid",
        "lunate",
        "triquetrum",
        "pisiform",
        "hamate",
        "capitate",
        "trapezium",
        "trapezoid",
      ]) ||
      (name.includes("of hand") &&
        includesAny(name, ["phalanx", "interosseous", "adductor pollicis"]))
    ) {
      return {
        skinProfileId: "palm",
        regionLabel: "Palm / hand",
        confidence: "high",
        reason: `Matched hand/palm mesh “${base}”`,
        meshBaseName: base,
      };
    }

    if (
      includesAny(name, [
        "tibia",
        "tibialis anterior",
        "tuberosity of tibia",
        "anterior border of tibia",
      ])
    ) {
      return {
        skinProfileId: "cortical-bone",
        regionLabel: "Shin (thin skin over bone)",
        confidence: "high",
        reason: `Matched shin/tibia mesh “${base}”`,
        meshBaseName: base,
      };
    }

    if (
      includesAny(name, [
        "patella",
        "costal cartilage",
        "articular cartilage",
        "meniscus",
      ])
    ) {
      return {
        skinProfileId: "articular-cartilage",
        regionLabel: "Joint / cartilage",
        confidence: "medium",
        reason: `Matched joint/cartilage mesh “${base}”`,
        meshBaseName: base,
      };
    }

    if (
      includesAny(name, [
        "radius",
        "ulna",
        "brachioradialis",
        "flexor carpi",
        "extensor carpi",
        "pronator",
        "supinator",
        "anconeus",
        "palmaris longus",
        "flexor digitorum",
        "extensor digitorum",
        "forearm",
      ])
    ) {
      return {
        skinProfileId: "volar-forearm",
        regionLabel: "Forearm",
        confidence: "high",
        reason: `Matched arm/forearm mesh “${base}”`,
        meshBaseName: base,
      };
    }

    if (
      includesAny(name, [
        "humerus",
        "biceps brachii",
        "brachialis",
        "triceps brachii",
        "deltoid",
      ])
    ) {
      return {
        skinProfileId: "volar-forearm",
        regionLabel: "Upper arm",
        confidence: "high",
        reason: `Matched upper-arm mesh “${base}”; using the closest available arm profile`,
        meshBaseName: base,
      };
    }

    if (
      includesAny(name, [
        "quadriceps",
        "vastus",
        "rectus femoris",
        "vastus medialis",
        "vastus lateralis",
        "sartorius",
      ])
    ) {
      return {
        skinProfileId: "quadriceps",
        regionLabel: "Front of thigh",
        confidence: "high",
        reason: `Matched quadriceps mesh “${base}”`,
        meshBaseName: base,
      };
    }

    if (
      includesAny(name, [
        "femur",
        "hamstring",
        "biceps femoris",
        "gracilis",
        "adductor",
        "gluteus",
        "iliotibial",
      ])
    ) {
      return {
        skinProfileId: "quadriceps",
        regionLabel: "Thigh",
        confidence: "medium",
        reason: `Matched thigh mesh “${base}”; using the closest available thigh profile`,
        meshBaseName: base,
      };
    }

    if (
      includesAny(name, [
        "fibula",
        "gastrocnemius",
        "soleus",
        "peroneus",
        "fibularis",
      ])
    ) {
      return {
        skinProfileId: "quadriceps",
        regionLabel: "Calf",
        confidence: "medium",
        reason: `Matched calf mesh “${base}”; using the closest available leg profile`,
        meshBaseName: base,
      };
    }
  }

  // Limb-level fallbacks when mesh name is missing or unrecognized.
  if (limb === "head") {
    return {
      skinProfileId: "scalp-hair",
      regionLabel: "Head",
      confidence: "medium",
      reason: "Limb fallback: head → scalp profile",
      meshBaseName: base,
    };
  }

  if (limb === "leftArm" || limb === "rightArm") {
    return {
      skinProfileId: "volar-forearm",
      regionLabel: limb === "leftArm" ? "Left arm" : "Right arm",
      confidence: name ? "medium" : "low",
      reason: name
        ? `Unrecognized arm mesh “${base}”; using forearm profile`
        : "Limb fallback: arm → forearm profile",
      meshBaseName: base,
    };
  }

  if (limb === "leftLeg" || limb === "rightLeg") {
    return {
      skinProfileId: "quadriceps",
      regionLabel: limb === "leftLeg" ? "Left leg" : "Right leg",
      confidence: "low",
      reason: "Limb fallback: leg → thigh profile; select Shin manually for bony anterior sites",
      meshBaseName: base,
    };
  }

  if (limb === "torso") {
    const normal = hit.normal;
    // Anatomy is Y-up; posterior surface normals point roughly −Z in the fitted body.
    const posterior = normal !== null && normal !== undefined && normal[2] < -0.25;
    if (posterior) {
      return {
        skinProfileId: "upper-back",
        regionLabel: "Torso (back)",
        confidence: "medium",
        reason: "Torso hit with posterior-facing normal → upper-back profile",
        meshBaseName: base,
      };
    }
    return {
      skinProfileId: "abdomen",
      regionLabel: "Torso (front)",
      confidence: "medium",
      reason: "Torso hit → abdomen profile",
      meshBaseName: base,
    };
  }

  return {
    skinProfileId: "volar-forearm",
    regionLabel: "Unknown body site",
    confidence: "low",
    reason: "No anatomy match; defaulting to volar forearm",
    meshBaseName: base,
  };
}
