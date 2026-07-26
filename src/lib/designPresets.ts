import type { DesignAsset } from "../store/experimentStore";

/**
 * Built-in, arm-worn device geometries generated as ASCII STL so they flow
 * through the exact same import → place → contact → simulate pipeline as an
 * uploaded CAD file. Dimensions are relative: the viewport auto-fits any design
 * onto the skin patch, so only the proportions of each band matter.
 *
 * Every band is a tube whose axis runs along X (the "arm" direction), so the
 * curved inner surface rests against the skin patch — the surface a real
 * wristband, bracelet or sleeve presses into a forearm.
 */

type Vec = [number, number, number];

type TubeSpec = {
  innerRadius: number;
  wall: number;
  length: number;
  /** Angular opening in radians for a C-shaped cuff; 0 makes a closed ring. */
  gap?: number;
  segments?: number;
};

function ring(radius: number, theta: number): [number, number] {
  return [radius * Math.cos(theta), radius * Math.sin(theta)];
}

/** Emit a quad as two triangles, preserving the given corner winding order. */
function quad(tris: Vec[][], a: Vec, b: Vec, c: Vec, d: Vec) {
  tris.push([a, b, c]);
  tris.push([a, c, d]);
}

function buildTube(spec: TubeSpec): Vec[][] {
  const segments = spec.segments ?? 64;
  const gap = spec.gap ?? 0;
  const closed = gap <= 1e-6;
  const innerR = spec.innerRadius;
  const outerR = spec.innerRadius + spec.wall;
  const xL = -spec.length / 2;
  const xR = spec.length / 2;

  const start = gap / 2;
  const end = Math.PI * 2 - gap / 2;
  const step = (end - start) / segments;

  const tris: Vec[][] = [];

  for (let i = 0; i < segments; i += 1) {
    const t0 = start + step * i;
    const t1 = start + step * (i + 1);
    const [oy0, oz0] = ring(outerR, t0);
    const [oy1, oz1] = ring(outerR, t1);
    const [iy0, iz0] = ring(innerR, t0);
    const [iy1, iz1] = ring(innerR, t1);

    // Outer wall (normals point radially outward).
    quad(
      tris,
      [xL, oy0, oz0],
      [xL, oy1, oz1],
      [xR, oy1, oz1],
      [xR, oy0, oz0],
    );
    // Inner wall (reversed winding so normals point toward the axis).
    quad(
      tris,
      [xL, iy0, iz0],
      [xR, iy0, iz0],
      [xR, iy1, iz1],
      [xL, iy1, iz1],
    );
    // Left annular cap (normal toward -X).
    quad(
      tris,
      [xL, iy0, iz0],
      [xL, iy1, iz1],
      [xL, oy1, oz1],
      [xL, oy0, oz0],
    );
    // Right annular cap (normal toward +X).
    quad(
      tris,
      [xR, iy0, iz0],
      [xR, oy0, oz0],
      [xR, oy1, oz1],
      [xR, iy1, iz1],
    );
  }

  if (!closed) {
    // Close the two radial faces left by the opening of a C-shaped cuff.
    for (const theta of [start, end]) {
      const [oy, oz] = ring(outerR, theta);
      const [iy, iz] = ring(innerR, theta);
      quad(
        tris,
        [xL, iy, iz],
        [xL, oy, oz],
        [xR, oy, oz],
        [xR, iy, iz],
      );
    }
  }

  return tris;
}

function toAsciiStl(name: string, tris: Vec[][]): string {
  const lines: string[] = [`solid ${name}`];
  for (const [a, b, c] of tris) {
    lines.push("  facet normal 0 0 0");
    lines.push("    outer loop");
    for (const v of [a, b, c]) {
      lines.push(`      vertex ${v[0].toFixed(6)} ${v[1].toFixed(6)} ${v[2].toFixed(6)}`);
    }
    lines.push("    endloop");
    lines.push("  endfacet");
  }
  lines.push(`endsolid ${name}`);
  return lines.join("\n");
}

export type DesignPreset = {
  id: string;
  label: string;
  description: string;
  fileName: string;
  tube: TubeSpec;
};

export const DESIGN_PRESETS: DesignPreset[] = [
  {
    id: "wristband",
    label: "Wristband / smartwatch cuff",
    description:
      "A closed band that wraps the wrist — the footprint of a smartwatch or fitness tracker.",
    fileName: "wristband.stl",
    tube: { innerRadius: 1.0, wall: 0.18, length: 0.9 },
  },
  {
    id: "bracelet",
    label: "Bracelet (open cuff)",
    description:
      "A thin C-shaped cuff with an opening, like a rigid bangle that clips onto the wrist.",
    fileName: "bracelet.stl",
    tube: { innerRadius: 1.0, wall: 0.12, length: 0.4, gap: (50 * Math.PI) / 180 },
  },
  {
    id: "sleeve",
    label: "Compression sleeve",
    description:
      "A long, thin tube covering much of the forearm, like a compression or heating sleeve.",
    fileName: "sleeve.stl",
    tube: { innerRadius: 1.0, wall: 0.1, length: 2.6 },
  },
];

/** Build an in-memory design asset for a preset, ready for the store. */
export function makePresetDesign(preset: DesignPreset): DesignAsset {
  const stl = toAsciiStl(preset.id, buildTube(preset.tube));
  return {
    id: crypto.randomUUID(),
    fileName: preset.fileName,
    kind: "stl",
    bytes: new TextEncoder().encode(stl),
  };
}
