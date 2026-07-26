import { create } from "zustand";
import { computePoseForContactOnSkin } from "../lib/alignContactToSkin";
import {
  runSimulation,
  type SimulationResult,
} from "../lib/simulation";
import {
  defaultParametersFor,
  type StimulusParameters,
  type StimulusType,
} from "../lib/stimuli";

export type Vec3 = [number, number, number];
export type CadKind = "stl" | "obj";
export type TransformMode = "translate" | "rotate" | "scale";
export type ToolMode = "orbit" | "contact" | TransformMode;
export type SidebarTab = "design" | "contacts" | "results";

export type DesignAsset = {
  id: string;
  fileName: string;
  kind: CadKind;
  bytes: Uint8Array;
};

/** Surface sample in design-local space so markers stick when the mesh moves. */
export type ContactPoint = {
  id: string;
  label: string;
  position: Vec3;
  normal: Vec3;
};

export type StimulusAssignment = {
  contactPointId: string;
  stimulusType: StimulusType;
  parameters: StimulusParameters;
};

export type ExperimentDefinition = {
  design: DesignAsset | null;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  contactPoints: ContactPoint[];
  assignments: StimulusAssignment[];
};

type ExperimentState = {
  design: DesignAsset | null;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  transformEpoch: number;
  tool: ToolMode;
  sidebarTab: SidebarTab;
  contactPoints: ContactPoint[];
  assignments: StimulusAssignment[];
  selectedContactId: string | null;
  simulationResult: SimulationResult | null;
  simulationStatus: "idle" | "running" | "complete" | "error";
  simulationError: string | null;
  isImporting: boolean;
  importError: string | null;

  setTool: (tool: ToolMode) => void;
  setSidebarTab: (tab: SidebarTab) => void;
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

  addContactPoint: (input: { position: Vec3; normal: Vec3 }) => string;
  selectContact: (id: string | null) => void;
  removeContactPoint: (id: string) => void;
  clearContactPoints: () => void;
  /** Rotate/translate the design so this contact sits on the skin patch. */
  snapContactToSkin: (contactPointId: string) => void;
  setStimulusType: (contactPointId: string, stimulusType: StimulusType) => void;
  setStimulusParameter: (
    contactPointId: string,
    key: string,
    value: number,
  ) => void;
  runSimulation: () => Promise<void>;
  clearSimulation: () => void;
  getExperimentDefinition: () => ExperimentDefinition;
};

const DEFAULT_POSITION: Vec3 = [0, 0, 0];
const DEFAULT_ROTATION: Vec3 = [0, 0, 0];
const DEFAULT_SCALE: Vec3 = [1, 1, 1];

function makeAssignment(contactPointId: string): StimulusAssignment {
  return {
    contactPointId,
    stimulusType: "heat",
    parameters: defaultParametersFor("heat"),
  };
}

export const useExperimentStore = create<ExperimentState>((set, get) => ({
  design: null,
  position: DEFAULT_POSITION,
  rotation: DEFAULT_ROTATION,
  scale: DEFAULT_SCALE,
  transformEpoch: 0,
  tool: "translate",
  sidebarTab: "design",
  contactPoints: [],
  assignments: [],
  selectedContactId: null,
  simulationResult: null,
  simulationStatus: "idle",
  simulationError: null,
  isImporting: false,
  importError: null,

  setTool: (tool) => set({ tool }),
  setSidebarTab: (sidebarTab) => set({ sidebarTab }),
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
      sidebarTab: "design",
      contactPoints: [],
      assignments: [],
      selectedContactId: null,
      simulationResult: null,
      simulationStatus: "idle",
      simulationError: null,
      importError: null,
    })),

  clearDesign: () =>
    set((state) => ({
      design: null,
      position: [...DEFAULT_POSITION] as Vec3,
      rotation: [...DEFAULT_ROTATION] as Vec3,
      scale: [...DEFAULT_SCALE] as Vec3,
      transformEpoch: state.transformEpoch + 1,
      contactPoints: [],
      assignments: [],
      selectedContactId: null,
      simulationResult: null,
      simulationStatus: "idle",
      simulationError: null,
      sidebarTab: "design",
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

  addContactPoint: ({ position, normal }) => {
    const id = crypto.randomUUID();

    set((state) => {
      const contact: ContactPoint = {
        id,
        label: `CP-${state.contactPoints.length + 1}`,
        position,
        normal,
      };

      const pose = computePoseForContactOnSkin(contact, {
        position: state.position,
        rotation: state.rotation,
        scale: state.scale,
      });

      return {
        contactPoints: [...state.contactPoints, contact],
        assignments: [...state.assignments, makeAssignment(id)],
        selectedContactId: id,
        sidebarTab: "contacts" as const,
        tool: "contact" as const,
        position: pose.position,
        rotation: pose.rotation,
        transformEpoch: state.transformEpoch + 1,
      };
    });

    return id;
  },

  selectContact: (selectedContactId) => set({ selectedContactId }),

  snapContactToSkin: (contactPointId) =>
    set((state) => {
      const contact = state.contactPoints.find((c) => c.id === contactPointId);
      if (!contact) return state;

      const pose = computePoseForContactOnSkin(contact, {
        position: state.position,
        rotation: state.rotation,
        scale: state.scale,
      });

      return {
        position: pose.position,
        rotation: pose.rotation,
        transformEpoch: state.transformEpoch + 1,
        selectedContactId: contactPointId,
      };
    }),

  removeContactPoint: (id) =>
    set((state) => {
      const contactPoints = state.contactPoints
        .filter((c) => c.id !== id)
        .map((c, index) => ({ ...c, label: `CP-${index + 1}` }));
      const selectedContactId =
        state.selectedContactId === id
          ? (contactPoints[0]?.id ?? null)
          : state.selectedContactId;
      return {
        contactPoints,
        assignments: state.assignments.filter((a) => a.contactPointId !== id),
        selectedContactId,
      };
    }),

  clearContactPoints: () =>
    set({
      contactPoints: [],
      assignments: [],
      selectedContactId: null,
    }),

  setStimulusType: (contactPointId, stimulusType) =>
    set((state) => ({
      assignments: state.assignments.map((assignment) =>
        assignment.contactPointId === contactPointId
          ? {
              ...assignment,
              stimulusType,
              parameters: defaultParametersFor(stimulusType),
            }
          : assignment,
      ),
    })),

  setStimulusParameter: (contactPointId, key, value) =>
    set((state) => ({
      assignments: state.assignments.map((assignment) =>
        assignment.contactPointId === contactPointId
          ? {
              ...assignment,
              parameters: { ...assignment.parameters, [key]: value },
            }
          : assignment,
      ),
    })),

  runSimulation: async () => {
    const state = get();
    if (state.contactPoints.length === 0) {
      set({
        simulationStatus: "error",
        simulationError: "Add at least one contact point before running a simulation.",
      });
      return;
    }

    set({
      simulationStatus: "running",
      simulationError: null,
      simulationResult: null,
    });

    try {
      const simulationResult = await runSimulation(
        state.contactPoints,
        state.assignments,
      );
      set({
        simulationResult,
        simulationStatus: "complete",
        simulationError: null,
        sidebarTab: "results",
      });
    } catch (error) {
      set({
        simulationStatus: "error",
        simulationError:
          error instanceof Error
            ? error.message
            : "The heat simulation could not be completed.",
      });
    }
  },

  clearSimulation: () =>
    set({
      simulationResult: null,
      simulationStatus: "idle",
      simulationError: null,
    }),

  getExperimentDefinition: () => {
    const state = get();
    return {
      design: state.design,
      position: state.position,
      rotation: state.rotation,
      scale: state.scale,
      contactPoints: state.contactPoints,
      assignments: state.assignments,
    };
  },
}));
