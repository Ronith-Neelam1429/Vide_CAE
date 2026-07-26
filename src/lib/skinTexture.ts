import {
  CanvasTexture,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
} from "three";

function hash2(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function smoothNoise(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  const a = hash2(x0, y0);
  const b = hash2(x0 + 1, y0);
  const c = hash2(x0, y0 + 1);
  const d = hash2(x0 + 1, y0 + 1);

  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x: number, y: number): number {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < 5; i += 1) {
    value += smoothNoise(x * freq, y * freq) * amp;
    amp *= 0.5;
    freq *= 2;
  }
  return value;
}

/** Ridged noise for vein/tendon-like streaks. */
function ridged(x: number, y: number): number {
  return 1 - Math.abs(2 * fbm(x, y) - 1);
}

export type SkinMaps = {
  map: CanvasTexture;
  roughnessMap: CanvasTexture;
  normalMap: CanvasTexture;
  dispose: () => void;
};

/**
 * Procedural skin maps generated at runtime (no external, license-encumbered
 * assets): a warm tone with mottling, freckles, and faint sub-dermal veins,
 * plus a matching roughness map and a normal map derived from a height field so
 * pores, veins and tendons catch the light. Designed to read as real skin under
 * a physical material with a warm back light.
 */
export function createSkinMaps(resolution = 1024): SkinMaps {
  const colorCanvas = document.createElement("canvas");
  colorCanvas.width = resolution;
  colorCanvas.height = resolution;
  const colorCtx = colorCanvas.getContext("2d", { willReadFrequently: true });
  const roughCanvas = document.createElement("canvas");
  roughCanvas.width = resolution;
  roughCanvas.height = resolution;
  const roughCtx = roughCanvas.getContext("2d", { willReadFrequently: true });
  const normalCanvas = document.createElement("canvas");
  normalCanvas.width = resolution;
  normalCanvas.height = resolution;
  const normalCtx = normalCanvas.getContext("2d", { willReadFrequently: true });
  if (!colorCtx || !roughCtx || !normalCtx) {
    throw new Error("Could not create skin texture canvases.");
  }

  const colorData = colorCtx.createImageData(resolution, resolution);
  const roughData = roughCtx.createImageData(resolution, resolution);
  const height = new Float32Array(resolution * resolution);

  for (let y = 0; y < resolution; y += 1) {
    for (let x = 0; x < resolution; x += 1) {
      const u = x / resolution;
      const v = y / resolution;
      const i = (y * resolution + x) * 4;
      const h = y * resolution + x;

      const blotch = fbm(u * 4.2, v * 4.2);
      const fine = fbm(u * 34, v * 34);
      const pores = fbm(u * 130, v * 130);
      // Veins run mostly lengthwise; stretch the domain so they streak along U.
      const veinField = ridged(u * 2.4 + 8, v * 7.5 - 3);
      const vein = Math.pow(Math.max(0, veinField - 0.72) / 0.28, 1.5);

      // Warm skin tone with local mottling.
      let r = 222 + blotch * 24 + fine * 8 - pores * 6;
      let g = 176 + blotch * 16 + fine * 6 - pores * 5;
      let b = 150 + blotch * 12 + fine * 5 - pores * 4;

      // Bluish veins tint the color slightly cooler and darker.
      r -= vein * 42;
      g -= vein * 26;
      b += vein * 14;

      colorData.data[i] = Math.min(255, Math.max(0, r));
      colorData.data[i + 1] = Math.min(255, Math.max(0, g));
      colorData.data[i + 2] = Math.min(255, Math.max(0, b));
      colorData.data[i + 3] = 255;

      const roughness = 150 + pores * 60 + fine * 25 - vein * 20;
      const rv = Math.min(235, Math.max(90, roughness));
      roughData.data[i] = rv;
      roughData.data[i + 1] = rv;
      roughData.data[i + 2] = rv;
      roughData.data[i + 3] = 255;

      // Height for the normal map: fine pore detail plus raised veins.
      height[h] = fine * 0.5 + pores * 0.3 + vein * 0.9;
    }
  }

  colorCtx.putImageData(colorData, 0, 0);
  roughCtx.putImageData(roughData, 0, 0);

  // Freckle / pore speckles on top of the base color.
  for (let n = 0; n < 2600; n += 1) {
    const x = Math.random() * resolution;
    const y = Math.random() * resolution;
    const radius = 0.4 + Math.random() * 1.3;
    const alpha = 0.03 + Math.random() * 0.07;
    colorCtx.fillStyle = `rgba(120, 70, 50, ${alpha})`;
    colorCtx.beginPath();
    colorCtx.arc(x, y, radius, 0, Math.PI * 2);
    colorCtx.fill();
  }

  // Derive a tangent-space normal map from the height field.
  const normalData = normalCtx.createImageData(resolution, resolution);
  const strength = 2.2;
  const at = (x: number, y: number) => {
    const xi = (x + resolution) % resolution;
    const yi = (y + resolution) % resolution;
    return height[yi * resolution + xi];
  };
  for (let y = 0; y < resolution; y += 1) {
    for (let x = 0; x < resolution; x += 1) {
      const i = (y * resolution + x) * 4;
      const dx = (at(x - 1, y) - at(x + 1, y)) * strength;
      const dy = (at(x, y - 1) - at(x, y + 1)) * strength;
      const nz = 1.0;
      const len = Math.hypot(dx, dy, nz) || 1;
      normalData.data[i] = Math.round(((dx / len) * 0.5 + 0.5) * 255);
      normalData.data[i + 1] = Math.round(((dy / len) * 0.5 + 0.5) * 255);
      normalData.data[i + 2] = Math.round(((nz / len) * 0.5 + 0.5) * 255);
      normalData.data[i + 3] = 255;
    }
  }
  normalCtx.putImageData(normalData, 0, 0);

  const finish = (canvas: HTMLCanvasElement, srgb: boolean) => {
    const tex = new CanvasTexture(canvas);
    if (srgb) tex.colorSpace = SRGBColorSpace;
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
    tex.anisotropy = 8;
    tex.minFilter = LinearMipmapLinearFilter;
    tex.needsUpdate = true;
    return tex;
  };

  const map = finish(colorCanvas, true);
  const roughnessMap = finish(roughCanvas, false);
  const normalMap = finish(normalCanvas, false);

  return {
    map,
    roughnessMap,
    normalMap,
    dispose: () => {
      map.dispose();
      roughnessMap.dispose();
      normalMap.dispose();
    },
  };
}
