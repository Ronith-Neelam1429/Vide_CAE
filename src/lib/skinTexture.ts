import {
  CanvasTexture,
  LinearMipmapLinearFilter,
  NearestFilter,
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

export type SkinMaps = {
  map: CanvasTexture;
  roughnessMap: CanvasTexture;
  dispose: () => void;
};

/** Procedural light skin maps — tonal variation + soft pore noise, no external assets. */
export function createSkinMaps(resolution = 512): SkinMaps {
  const colorCanvas = document.createElement("canvas");
  colorCanvas.width = resolution;
  colorCanvas.height = resolution;
  const colorCtx = colorCanvas.getContext("2d", { willReadFrequently: true });
  if (!colorCtx) {
    throw new Error("Could not create skin color canvas.");
  }

  const roughCanvas = document.createElement("canvas");
  roughCanvas.width = resolution;
  roughCanvas.height = resolution;
  const roughCtx = roughCanvas.getContext("2d", { willReadFrequently: true });
  if (!roughCtx) {
    throw new Error("Could not create skin roughness canvas.");
  }

  const colorData = colorCtx.createImageData(resolution, resolution);
  const roughData = roughCtx.createImageData(resolution, resolution);

  for (let y = 0; y < resolution; y += 1) {
    for (let x = 0; x < resolution; x += 1) {
      const u = x / resolution;
      const v = y / resolution;
      const i = (y * resolution + x) * 4;

      const blotch = fbm(u * 4.2, v * 4.2);
      const fine = fbm(u * 28, v * 28);
      const vein = fbm(u * 2.1 + 8, v * 2.4 - 3);

      // Warm Caucasian-leaning research-demo tone with local variation.
      const r = 214 + blotch * 28 + fine * 10 - vein * 8;
      const g = 168 + blotch * 18 + fine * 8 - vein * 4;
      const b = 142 + blotch * 12 + fine * 6 + vein * 10;

      colorData.data[i] = Math.min(255, Math.max(0, r));
      colorData.data[i + 1] = Math.min(255, Math.max(0, g));
      colorData.data[i + 2] = Math.min(255, Math.max(0, b));
      colorData.data[i + 3] = 255;

      const roughness = 150 + fine * 55 + blotch * 20;
      const rv = Math.min(255, Math.max(90, roughness));
      roughData.data[i] = rv;
      roughData.data[i + 1] = rv;
      roughData.data[i + 2] = rv;
      roughData.data[i + 3] = 255;
    }
  }

  colorCtx.putImageData(colorData, 0, 0);
  roughCtx.putImageData(roughData, 0, 0);

  // Soft freckle / pore speckles.
  for (let n = 0; n < 1800; n += 1) {
    const x = Math.random() * resolution;
    const y = Math.random() * resolution;
    const radius = 0.4 + Math.random() * 1.2;
    const alpha = 0.04 + Math.random() * 0.08;
    colorCtx.fillStyle = `rgba(120, 70, 50, ${alpha})`;
    colorCtx.beginPath();
    colorCtx.arc(x, y, radius, 0, Math.PI * 2);
    colorCtx.fill();
  }

  const map = new CanvasTexture(colorCanvas);
  map.colorSpace = SRGBColorSpace;
  map.wrapS = RepeatWrapping;
  map.wrapT = RepeatWrapping;
  map.anisotropy = 8;
  map.minFilter = LinearMipmapLinearFilter;
  map.magFilter = NearestFilter;
  map.needsUpdate = true;

  const roughnessMap = new CanvasTexture(roughCanvas);
  roughnessMap.wrapS = RepeatWrapping;
  roughnessMap.wrapT = RepeatWrapping;
  roughnessMap.anisotropy = 4;
  roughnessMap.needsUpdate = true;

  return {
    map,
    roughnessMap,
    dispose: () => {
      map.dispose();
      roughnessMap.dispose();
    },
  };
}
