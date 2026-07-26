import { create } from "zustand";
import { computePoseForContactOnSkin } from "../lib/alignContactToSkin";
import {
  fetchModelCatalog,
  runSimulation,
  verifySolver,
  SOLVER_PRESETS,
  type ModelCatalog,
  type SimulationResult,
  type SolverPresetId,
  type VerificationSuite,
} from "../lib/simulation";
import { runMechanics, type MechanicsResult } from "../lib/mechanics";
import {
  defaultOptionsFor,
  defaultParametersFor,
  STIMULUS_PRESETS,
  type StimulusOptions,
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
  options: StimulusOptions;
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
  mechanicsResult: MechanicsResult | null;
  solverPreset: SolverPresetId;
  catalog: ModelCatalog | null;
  verification: VerificationSuite | null;
  verificationStatus: "idle" | "running" | "complete" | "error";
  isImporting: boolean;
  importError: string | null;
  /** Reveal the internal tissue layers and bone of the forearm model. */
  showAnatomy: boolean;
  /** Timeline position (seconds) used to animate the simulated response. */
  playbackTimeS: number;
  isPlaying: boolean;

  setTool: (tool: ToolMode) => void;
  toggleAnatomy: () => void;
  setPlaybackTime: (timeS: number) => void;
  setPlaying: (value: boolean) => void;
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
  setStimulusOption: (
    contactPointId: string,
    key: string,
    value: string,
  ) => void;
  /** Fill every field of one contact from a named scenario. */
  applyPreset: (contactPointId: string, presetId: string) => void;
  /** Copy one contact's stimulus setup onto every other contact. */
  copyStimulusToAll: (contactPointId: string) => void;
  setSolverPreset: (preset: SolverPresetId) => void;
  loadCatalog: () => Promise<void>;
  runVerification: () => Promise<void>;
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
    options: defaultOptionsFor("heat"),
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
  mechanicsResult: null,
  solverPreset: "balanced",
  catalog: null,
  verification: null,
  verificationStatus: "idle",
  isImporting: false,
  importError: null,
  showAnatomy: false,
  playbackTimeS: 0,
  isPlaying: false,

  setTool: (tool) => set({ tool }),
  toggleAnatomy: () => set((state) => ({ showAnatomy: !state.showAnatomy })),
  setPlaybackTime: (playbackTimeS) => set({ playbackTimeS }),
  setPlaying: (isPlaying) => set({ isPlaying }),
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
      mechanicsResult: null,
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
      mechanicsResult: null,
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
              options: defaultOptionsFor(stimulusType),
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

  setStimulusOption: (contactPointId, key, value) =>
    set((state) => ({
      assignments: state.assignments.map((assignment) => {
        if (assignment.contactPointId !== contactPointId) return assignment;

        const options = { ...assignment.options, [key]: value };
        const parameters = { ...assignment.parameters };

        // Each interface has its own sensible film thickness; carrying the
        // previous one over would silently produce a nonsense conductance.
        if (key === "interfaceMaterialId") {
          const material = get().catalog?.interfaceMaterials.find(
            (candidate) => candidate.id === value,
          );
          if (material) {
            parameters.interfaceThicknessUm = material.defaultThicknessUm;
          }
        }

        if (key === "skinProfileId") {
          const profile = get().catalog?.skinProfiles.find(
            (candidate) => candidate.id === value,
          );
          if (profile) {
            parameters.baselineSkinTemperatureC = profile.baselineSkinC.value;
          }
        }

        return { ...assignment, options, parameters };
      }),
    })),

  applyPreset: (contactPointId, presetId) =>
    set((state) => {
      const preset = STIMULUS_PRESETS.find((candidate) => candidate.id === presetId);
      if (!preset) return state;

      return {
        assignments: state.assignments.map((assignment) =>
          assignment.contactPointId === contactPointId
            ? {
                ...assignment,
                stimulusType: preset.stimulusType,
                parameters: {
                  ...defaultParametersFor(preset.stimulusType),
                  ...preset.parameters,
                },
                options: {
                  ...defaultOptionsFor(preset.stimulusType),
                  ...preset.options,
                },
              }
            : assignment,
        ),
      };
    }),

  copyStimulusToAll: (contactPointId) =>
    set((state) => {
      const source = state.assignments.find(
        (assignment) => assignment.contactPointId === contactPointId,
      );
      if (!source) return state;

      return {
        assignments: state.assignments.map((assignment) => ({
          ...assignment,
          stimulusType: source.stimulusType,
          parameters: { ...source.parameters },
          options: { ...source.options },
        })),
      };
    }),

  setSolverPreset: (solverPreset) => set({ solverPreset }),

  loadCatalog: async () => {
    if (get().catalog) return;
    try {
      set({ catalog: await fetchModelCatalog() });
    } catch {
      // The catalog only drives labels and defaults, so the app stays usable
      // without it; the solver falls back to its own defaults.
    }
  },

  runVerification: async () => {
    set({ verificationStatus: "running" });
    try {
      set({
        verification: await verifySolver(),
        verificationStatus: "complete",
      });
    } catch {
      set({ verificationStatus: "error" });
    }
  },

  runSimulation: async () => {
    const state = get();
    if (state.contactPoints.length === 0) {
      set({
        simulationStatus: "error",
        simulationError: "Add at least one contact point before running a simulation.",
      });
      return;
    }

    const stimulusFor = (contactId: string) =>
      state.assignments.find((a) => a.contactPointId === contactId)?.stimulusType;
    const heatContacts = state.contactPoints.filter(
      (c) => stimulusFor(c.id) === "heat",
    );
    const pressureContacts = state.contactPoints.filter(
      (c) => stimulusFor(c.id) === "pressure",
    );

    set({
      simulationStatus: "running",
      simulationError: null,
      simulationResult: null,
      mechanicsResult: null,
      playbackTimeS: 0,
      isPlaying: false,
      sidebarTab: "results",
    });

    const settings = SOLVER_PRESETS[state.solverPreset].settings;

    try {
      const [simulationResult, mechanicsResult] = await Promise.all([
        heatContacts.length > 0
          ? runSimulation(heatContacts, state.assignments, settings)
          : Promise.resolve(null),
        pressureContacts.length > 0
          ? runMechanics(pressureContacts, state.assignments, settings)
          : Promise.resolve(null),
      ]);
      set({
        simulationResult,
        mechanicsResult,
        simulationStatus: "complete",
        simulationError: null,
        sidebarTab: "results",
      });
    } catch (error) {
      set({
        simulationStatus: "error",
        simulationError:
          typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : "The simulation could not be completed.",
      });
    }
  },

  clearSimulation: () =>
    set({
      simulationResult: null,
      mechanicsResult: null,
      simulationStatus: "idle",
      simulationError: null,
      isPlaying: false,
      playbackTimeS: 0,
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
