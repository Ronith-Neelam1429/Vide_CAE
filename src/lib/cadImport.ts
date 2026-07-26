import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import {
  Box3,
  BufferGeometry,
  Group,
  Mesh,
  Vector3,
  type Object3D,
} from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CadKind } from "../store/experimentStore";

export type PickedCadFile = {
  fileName: string;
  kind: CadKind;
  bytes: Uint8Array;
};

function extensionOf(path: string): string {
  const base = path.split(/[/\\]/).pop() ?? path;
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot + 1).toLowerCase() : "";
}

function kindFromPath(path: string): CadKind | null {
  const ext = extensionOf(path);
  if (ext === "stl") return "stl";
  if (ext === "obj") return "obj";
  return null;
}

export async function pickCadFile(): Promise<PickedCadFile | null> {
  const selected = await open({
    multiple: false,
    directory: false,
    title: "Import CAD design",
    filters: [
      {
        name: "CAD Mesh",
        extensions: ["stl", "obj"],
      },
    ],
  });

  if (selected === null) return null;

  const path = Array.isArray(selected) ? selected[0] : selected;
  if (!path) return null;

  const kind = kindFromPath(path);
  if (!kind) {
    throw new Error("Unsupported file type. Choose an .stl or .obj file.");
  }

  const data = await readFile(path);
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const fileName = path.split(/[/\\]/).pop() ?? `model.${kind}`;

  return { fileName, kind, bytes };
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function fitObjectToSkin(root: Object3D, targetSize = 2.2) {
  const box = new Box3().setFromObject(root);
  if (box.isEmpty()) return;

  const size = new Vector3();
  const center = new Vector3();
  box.getSize(size);
  box.getCenter(center);

  root.position.sub(center);
  root.position.y += size.y / 2;

  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim > 1e-6) {
    const s = targetSize / maxDim;
    root.scale.multiplyScalar(s);
    root.position.multiplyScalar(s);
  }

  // Sit the fitted mesh on the skin plane (y = 0).
  const fitted = new Box3().setFromObject(root);
  root.position.y -= fitted.min.y;
}

function geometryFromStl(bytes: Uint8Array): BufferGeometry {
  const loader = new STLLoader();
  const geometry = loader.parse(asArrayBuffer(bytes));
  geometry.computeVertexNormals();
  return geometry;
}

function geometryFromObj(bytes: Uint8Array): BufferGeometry {
  const text = new TextDecoder().decode(bytes);
  const loader = new OBJLoader();
  const group = loader.parse(text);
  const geometries: BufferGeometry[] = [];

  group.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;

    const geom = mesh.geometry.clone();
    mesh.updateWorldMatrix(true, false);
    geom.applyMatrix4(mesh.matrixWorld);
    geometries.push(geom);
  });

  if (geometries.length === 0) {
    throw new Error("OBJ file did not contain any mesh geometry.");
  }

  const merged =
    geometries.length === 1
      ? geometries[0]
      : mergeGeometries(geometries, false);

  if (!merged) {
    throw new Error("Could not merge OBJ mesh geometry.");
  }

  merged.computeVertexNormals();
  return merged;
}

export function loadCadObject(bytes: Uint8Array, kind: CadKind): Group {
  const geometry =
    kind === "stl" ? geometryFromStl(bytes) : geometryFromObj(bytes);

  const mesh = new Mesh(geometry);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = "ImportedDesignMesh";

  const root = new Group();
  root.name = "ImportedDesign";
  root.add(mesh);
  fitObjectToSkin(root);
  return root;
}
