/**
 * Full-body human anatomy sourced from the Z-Anatomy open dataset
 * (CC BY-SA 4.0), packaged for the web by Hello-Tebatso/body-anatomy-3d-viewer.
 */

export const ANATOMY_MODEL_URL = "/models/anatomy/body.glb";

export type AnatomyMeshKind = "bone" | "muscle" | "other";

export type AnatomyAttribution = {
  title: string;
  creators: string[];
  license: string;
  licenseUrl: string;
  sourceUrl: string;
  derivativeNote: string;
};

export const ANATOMY_ATTRIBUTION: AnatomyAttribution = {
  title: "Z-Anatomy full human body",
  creators: [
    "Z-Anatomy (Gauthier Kervyn, Marcin Zielinski)",
    "BodyParts3D / Life Sciences Integrated Database Center",
    "Hello-Tebatso (web-optimized GLB packaging)",
  ],
  license: "Creative Commons Attribution-ShareAlike 4.0 International",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  sourceUrl: "https://github.com/Hello-Tebatso/body-anatomy-3d-viewer",
  derivativeNote:
    "Vide displays the complete Z-Anatomy musculoskeletal model with all bones and muscles.",
};

function meshVariantRank(name: string): number {
  const match = name.match(/\.(\d+)$/);
  return match ? Number.parseInt(match[1], 10) : 0;
}

function meshBaseName(name: string): string {
  return name.replace(/\.\d+$/, "");
}

/** Pick the highest-numbered variant for each base mesh name. */
export function pickMeshVariants(names: string[]): Set<string> {
  const best = new Map<string, { name: string; rank: number }>();
  for (const name of names) {
    if (!name) continue;
    const base = meshBaseName(name);
    const rank = meshVariantRank(name);
    const prev = best.get(base);
    if (!prev || rank > prev.rank) {
      best.set(base, { name, rank });
    }
  }
  return new Set([...best.values()].map((entry) => entry.name));
}

export function anatomyMeshKind(userData: Record<string, unknown> | undefined): AnatomyMeshKind {
  const type = userData?.type;
  if (type === "bone" || type === "muscle") return type;
  return "other";
}

/** Names used to locate the right forearm for heat/contact overlays. */
export const FOREARM_OVERLAY_MESH = /^Radius(\.\d+)?$/;
