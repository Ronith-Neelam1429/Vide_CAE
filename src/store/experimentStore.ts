import { create } from "zustand";

export type Vec3 = [number, number, number];
export type CadKind = "stl" | "obj";
export type TransformMode = "translate" | "rotate" | "scale";
export type ToolMode = "orbit" | TransformMode;

export type DesignAsset = {
  id: string;
  fileName: string;
  kind: CadKind;
  bytes: Uint8Array;
};

type ExperimentState = {
  design: DesignAsset | null;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  /** Bumped when transform should be force-applied from the store (import/reset). */
  transformEpoch: number;
  tool: ToolMode;
  isImporting: boolean;
  importError: string | null;
  setTool: (tool: ToolMode) => void;
  setImporting: (value: boolean) => void;
  setImportError: (message: string | null) => void;
  setDesign: (design: DesignAsset) => void;
  clearDesign: () => void;
  setTransform: (partial: {
    position?: Vec3;
    rotation?: Vec3;
    scale?: Vec3;
  }) => void;
  resetTransform: () => void;
};

const DEFAULT_POSITION: Vec3 = [0, 0, 0];
const DEFAULT_ROTATION: Vec3 = [0, 0, 0];
const DEFAULT_SCALE: Vec3 = [1, 1, 1];

export const useExperimentStore = create<ExperimentState>((set) => ({
  design: null,
  position: DEFAULT_POSITION,
  rotation: DEFAULT_ROTATION,
  scale: DEFAULT_SCALE,
  transformEpoch: 0,
  tool: "translate",
  isImporting: false,
  importError: null,

  setTool: (tool) => set({ tool }),
  setImporting: (isImporting) => set({ isImporting }),
  setImportError: (importError) => set({ importError }),

  setDesign: (design) =>
    set((state) => ({
      design,
      position: [...DEFAULT_POSITION] as Vec3,
      rotation: [...DEFAULT_ROTATION] as Vec3,
      scale: [...DEFAULT_SCALE] as Vec3,
      transformEpoch: state.transformEpoch + 1,
      tool: "translate",
      importError: null,
    })),

  clearDesign: () =>
    set((state) => ({
      design: null,
      position: [...DEFAULT_POSITION] as Vec3,
      rotation: [...DEFAULT_ROTATION] as Vec3,
      scale: [...DEFAULT_SCALE] as Vec3,
      transformEpoch: state.transformEpoch + 1,
      importError: null,
    })),

  setTransform: (partial) =>
    set((state) => ({
      position: partial.position ?? state.position,
      rotation: partial.rotation ?? state.rotation,
      scale: partial.scale ?? state.scale,
    })),

  resetTransform: () =>
    set((state) => ({
      position: [...DEFAULT_POSITION] as Vec3,
      rotation: [...DEFAULT_ROTATION] as Vec3,
      scale: [...DEFAULT_SCALE] as Vec3,
      transformEpoch: state.transformEpoch + 1,
    })),
}));
