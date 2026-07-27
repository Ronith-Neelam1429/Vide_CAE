import { create } from "zustand";
import { computePoseForContactOnSkin } from "../lib/alignContactToSkin";
import type { AnatomyLimbId, AnatomyLimbRotations } from "../lib/anatomyLimbs";
import {
  fetchModelCatalog,
  runSimulation,
  runProofLab,
  runValidation,
  verifySolver,
  fetchProofLabLibrary,
  SOLVER_PRESETS,
  type ModelCatalog,
  type ProofLabLibraryEntry,
  type ProofLabReport,
  type ProofLabRequest,
  type SimulationResult,
  type SolverPresetId,
  type ValidationSuiteReport,
  type VerificationSuite,
} from "../lib/simulation";
import { runMechanics, type MechanicsResult } from "../lib/mechanics";
import { literatureCaseById } from "../lib/literatureCases";
import { computeProtocolMatch } from "../lib/proofLabProtocol";
import { contactStateById, type ContactStateId } from "../lib/contactStates";
import {
  analyzeProofLabWithAssist,
  fetchAssistStatus,
  suggestProtocolWithAssist,
  type AssistConfigStatus,
  type ProofLabAnalysis,
  type ProofLabAnalysisPayload,
  type ProtocolSuggestion,
} from "../lib/assist";
import {
  resolveSkinProfileFromAnatomy,
  type SkinProfileResolution,
} from "../lib/skinProfileFromAnatomy";
import {
  defaultOptionsFor,
  defaultParametersFor,
  type StimulusOptions,
  type StimulusParameters,
  type StimulusType,
} from "../lib/stimuli";

export type Vec3 = [number, number, number];
export type CadKind = "stl" | "obj";
export type TransformMode = "translate" | "rotate" | "scale";
export type ToolMode = "orbit" | "contact" | TransformMode;
export type SidebarTab = "contacts";
export type BottomPanelTab = "output" | "results" | "proof-lab";

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
  /** Mesh that owns these local coordinates. */
  surface: "design" | "body";
  /** Z-Anatomy mesh name at click (body contacts). */
  anatomyMeshName?: string | null;
  /** Coarse limb bucket at click (body contacts). */
  anatomyLimbId?: AnatomyLimbId | null;
  /** Human-readable body region inferred from the hit. */
  anatomyRegionLabel?: string | null;
  /** Why a skin profile was chosen for this placement. */
  anatomyProfileReason?: string | null;
  anatomyProfileConfidence?: SkinProfileResolution["confidence"] | null;
};

export type StimulusAssignment = {
  contactPointId: string;
  stimulusType: StimulusType;
  parameters: StimulusParameters;
  options: StimulusOptions;
  /** Locked literature benchmark when applied from the protocol assistant. */
  literatureCaseId?: string | null;
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
  sidebarWidthPx: number;
  bottomPanelTab: BottomPanelTab;
  bottomPanelExpanded: boolean;
  bottomPanelHeightPx: number;
  bottomPanelFullscreen: boolean;
  /** Persist Advanced stimulus fields open/closed across contact switches. */
  stimulusAdvancedOpen: boolean;
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
  validationResult: ValidationSuiteReport | null;
  validationStatus: "idle" | "running" | "complete" | "error";
  validationError: string | null;
  showValidationDashboard: boolean;
  proofLabResult: ProofLabReport | null;
  proofLabStatus: "idle" | "running" | "complete" | "error";
  proofLabError: string | null;
  proofLabAnalysis: ProofLabAnalysis | null;
  proofLabAnalysisStatus: "idle" | "running" | "complete" | "error";
  proofLabAnalysisError: string | null;
  proofLabLibrary: ProofLabLibraryEntry[];
  proofLabLibraryStatus: "idle" | "loading" | "ready" | "error";
  proofLabSelectedCaseIds: string[];
  showProofLab: boolean;
  assistStatus: AssistConfigStatus | null;
  isImporting: boolean;
  importError: string | null;
  /** Reveal the internal tissue layers and bone of the forearm model. */
  showAnatomy: boolean;
  /** Load and display the Z-Anatomy human body in the viewport. */
  showBody: boolean;
  anatomyPosition: Vec3;
  anatomyRotation: Vec3;
  anatomyScale: Vec3;
  anatomyLimbRotations: AnatomyLimbRotations;
  selectedAnatomyLimb: AnatomyLimbId | null;
  anatomyTransformEpoch: number;
  /** Timeline position (seconds) used to animate the simulated response. */
  playbackTimeS: number;
  isPlaying: boolean;

  setTool: (tool: ToolMode) => void;
  setSidebarWidthPx: (widthPx: number) => void;
  setBottomPanelTab: (tab: BottomPanelTab) => void;
  setBottomPanelExpanded: (expanded: boolean) => void;
  setBottomPanelHeightPx: (heightPx: number) => void;
  setBottomPanelFullscreen: (fullscreen: boolean) => void;
  setStimulusAdvancedOpen: (open: boolean) => void;
  toggleAnatomy: () => void;
  toggleShowBody: () => void;
  setAnatomyTransform: (partial: {
    position?: Vec3;
    rotation?: Vec3;
    scale?: Vec3;
  }) => void;
  setAnatomyLimbRotation: (limb: AnatomyLimbId, rotation: Vec3) => void;
  setSelectedAnatomyLimb: (limb: AnatomyLimbId | null) => void;
  resetAnatomyTransform: () => void;
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

  addContactPoint: (input: {
    position: Vec3;
    normal: Vec3;
    surface?: ContactPoint["surface"];
    anatomyMeshName?: string | null;
    anatomyLimbId?: AnatomyLimbId | null;
  }) => string;
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
  /** Apply a named interface state without exposing raw thermal-contact inputs. */
  applyContactState: (contactPointId: string, stateId: ContactStateId) => void;
  /** Fill every field of one contact from a named scenario. */
  applyLiteratureCase: (contactPointId: string, caseId: string) => void;
  /** Apply an assist suggestion (Azure or rules) onto a contact. */
  applyProtocolSuggestion: (
    contactPointId: string,
    suggestion: ProtocolSuggestion,
  ) => void;
  /** Overwrite sidebar heat settings with a Proof Lab study's published protocol. */
  applyProofLabStudyProtocol: (
    contactPointId: string,
    paperInputs: Record<string, number>,
    paperOptions: Record<string, string>,
  ) => void;
  /** Match free text to a literature protocol via assist; auto-apply on high confidence. */
  suggestProtocolFromText: (
    contactPointId: string,
    text: string,
  ) => Promise<ProtocolSuggestion | null>;
  loadAssistStatus: () => Promise<void>;
  /** Copy one contact's stimulus setup onto every other contact. */
  copyStimulusToAll: (contactPointId: string) => void;
  setSolverPreset: (preset: SolverPresetId) => void;
  loadCatalog: () => Promise<void>;
  runVerification: () => Promise<void>;
  runValidationSuite: (options?: {
    includeSyntheticFixtures?: boolean;
  }) => Promise<void>;
  openValidationDashboard: () => void;
  closeValidationDashboard: () => void;
  runProofLab: (options?: { focus?: boolean }) => Promise<void>;
  loadProofLabLibrary: () => Promise<void>;
  toggleProofLabCase: (caseId: string) => void;
  setProofLabSelectedCases: (caseIds: string[]) => void;
  selectAllProofLabCases: () => void;
  clearProofLabCases: () => void;
  analyzeProofLab: () => Promise<void>;
  openProofLab: () => void;
  closeProofLab: () => void;
  runSimulation: () => Promise<void>;
  clearSimulation: () => void;
  getExperimentDefinition: () => ExperimentDefinition;
};

const DEFAULT_ANATOMY_POSITION: Vec3 = [0, 0, 0];
const DEFAULT_ANATOMY_ROTATION: Vec3 = [0, 0, 0];
const DEFAULT_ANATOMY_SCALE: Vec3 = [1, 1, 1];
const DEFAULT_ROTATION: Vec3 = [0, 0, 0];
const DEFAULT_SCALE: Vec3 = [1, 1, 1];
const DEFAULT_POSITION: Vec3 = [0, 0, 0];

function makeAssignment(
  contactPointId: string,
  skinProfileId?: string,
  baselineSkinTemperatureC?: number,
): StimulusAssignment {
  const parameters = defaultParametersFor("heat");
  if (baselineSkinTemperatureC !== undefined) {
    parameters.baselineSkinTemperatureC = baselineSkinTemperatureC;
  }
  return {
    contactPointId,
    stimulusType: "heat",
    parameters,
    options: {
      ...defaultOptionsFor("heat"),
      ...(skinProfileId ? { skinProfileId } : {}),
    },
  };
}

export const useExperimentStore = create<ExperimentState>((set, get) => ({
  design: null,
  position: DEFAULT_POSITION,
  rotation: DEFAULT_ROTATION,
  scale: DEFAULT_SCALE,
  transformEpoch: 0,
  tool: "translate",
  sidebarTab: "contacts",
  sidebarWidthPx: 300,
  bottomPanelTab: "output",
  bottomPanelExpanded: false,
  bottomPanelHeightPx: 280,
  bottomPanelFullscreen: false,
  stimulusAdvancedOpen: false,
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
  validationResult: null,
  validationStatus: "idle",
  validationError: null,
  showValidationDashboard: false,
  proofLabResult: null,
  proofLabStatus: "idle",
  proofLabError: null,
  proofLabAnalysis: null,
  proofLabAnalysisStatus: "idle",
  proofLabAnalysisError: null,
  proofLabLibrary: [],
  proofLabLibraryStatus: "idle",
  proofLabSelectedCaseIds: [],
  showProofLab: false,
  assistStatus: null,
  isImporting: false,
  importError: null,
  showAnatomy: false,
  showBody: false,
  anatomyPosition: DEFAULT_ANATOMY_POSITION,
  anatomyRotation: DEFAULT_ANATOMY_ROTATION,
  anatomyScale: DEFAULT_ANATOMY_SCALE,
  anatomyLimbRotations: {},
  selectedAnatomyLimb: null,
  anatomyTransformEpoch: 0,
  playbackTimeS: 0,
  isPlaying: false,

  setTool: (tool) => set({ tool }),
  toggleAnatomy: () => set((state) => ({ showAnatomy: !state.showAnatomy })),
  toggleShowBody: () =>
    set((state) => {
      const showBody = !state.showBody;
      return {
        showBody,
        tool:
          showBody && (state.tool === "orbit" || state.tool === "contact")
            ? ("translate" as const)
            : state.tool,
        selectedAnatomyLimb: showBody ? state.selectedAnatomyLimb : null,
      };
    }),
  setAnatomyTransform: (partial) =>
    set((state) => ({
      anatomyPosition: partial.position ?? state.anatomyPosition,
      anatomyRotation: partial.rotation ?? state.anatomyRotation,
      anatomyScale: partial.scale ?? state.anatomyScale,
    })),
  setAnatomyLimbRotation: (limb, rotation) =>
    set((state) => ({
      anatomyLimbRotations: { ...state.anatomyLimbRotations, [limb]: rotation },
    })),
  setSelectedAnatomyLimb: (selectedAnatomyLimb) => set({ selectedAnatomyLimb }),
  resetAnatomyTransform: () =>
    set((state) => ({
      anatomyPosition: [...DEFAULT_ANATOMY_POSITION] as Vec3,
      anatomyRotation: [...DEFAULT_ANATOMY_ROTATION] as Vec3,
      anatomyScale: [...DEFAULT_ANATOMY_SCALE] as Vec3,
      anatomyLimbRotations: {},
      selectedAnatomyLimb: null,
      anatomyTransformEpoch: state.anatomyTransformEpoch + 1,
    })),
  setPlaybackTime: (playbackTimeS) => set({ playbackTimeS }),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setSidebarTab: (sidebarTab) => set({ sidebarTab }),
  setSidebarWidthPx: (sidebarWidthPx) =>
    set({ sidebarWidthPx: Math.min(480, Math.max(220, sidebarWidthPx)) }),
  setBottomPanelTab: (bottomPanelTab) =>
    set({ bottomPanelTab, bottomPanelExpanded: true }),
  setBottomPanelExpanded: (bottomPanelExpanded) =>
    set({
      bottomPanelExpanded,
      ...(bottomPanelExpanded ? {} : { bottomPanelFullscreen: false }),
    }),
  setBottomPanelHeightPx: (bottomPanelHeightPx) =>
    set({ bottomPanelHeightPx: Math.min(560, Math.max(160, bottomPanelHeightPx)) }),
  setBottomPanelFullscreen: (bottomPanelFullscreen) =>
    set({
      bottomPanelFullscreen,
      ...(bottomPanelFullscreen ? { bottomPanelExpanded: true } : {}),
    }),
  setStimulusAdvancedOpen: (stimulusAdvancedOpen) => set({ stimulusAdvancedOpen }),
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
      sidebarTab: "contacts",
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
      sidebarTab: "contacts",
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

  addContactPoint: ({
    position,
    normal,
    surface = "design",
    anatomyMeshName = null,
    anatomyLimbId = null,
  }) => {
    const id = crypto.randomUUID();

    set((state) => {
      const anatomyResolution =
        surface === "body"
          ? resolveSkinProfileFromAnatomy({
              meshName: anatomyMeshName,
              limbId: anatomyLimbId,
              normal,
            })
          : null;

      const profile = anatomyResolution
        ? state.catalog?.skinProfiles.find(
            (entry) => entry.id === anatomyResolution.skinProfileId,
          )
        : undefined;

      const contact: ContactPoint = {
        id,
        label: `CP-${state.contactPoints.length + 1}`,
        position,
        normal,
        surface,
        anatomyMeshName,
        anatomyLimbId,
        anatomyRegionLabel: anatomyResolution?.regionLabel ?? null,
        anatomyProfileReason: anatomyResolution?.reason ?? null,
        anatomyProfileConfidence: anatomyResolution?.confidence ?? null,
      };

      const pose =
        surface === "design"
          ? computePoseForContactOnSkin(contact, {
              position: state.position,
              rotation: state.rotation,
              scale: state.scale,
            })
          : null;

      return {
        contactPoints: [...state.contactPoints, contact],
        assignments: [
          ...state.assignments,
          makeAssignment(
            id,
            anatomyResolution?.skinProfileId,
            profile?.baselineSkinC.value,
          ),
        ],
        selectedContactId: id,
        sidebarTab: "contacts" as const,
        // One-shot placement: exit stimulus mode after each new contact.
        tool: "translate" as const,
        position: pose?.position ?? state.position,
        rotation: pose?.rotation ?? state.rotation,
        transformEpoch: pose ? state.transformEpoch + 1 : state.transformEpoch,
      };
    });

    return id;
  },

  selectContact: (selectedContactId) => set({ selectedContactId }),

  snapContactToSkin: (contactPointId) =>
    set((state) => {
      const contact = state.contactPoints.find((c) => c.id === contactPointId);
      if (!contact || contact.surface !== "design") return state;

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

  applyContactState: (contactPointId, stateId) =>
    set((state) => {
      const contactState = contactStateById(stateId);
      if (!contactState) return state;

      return {
        assignments: state.assignments.map((assignment) =>
          assignment.contactPointId === contactPointId
            ? {
                ...assignment,
                parameters: {
                  ...assignment.parameters,
                  ...contactState.parameters,
                  // A measured value should remain authoritative.
                  ...(assignment.parameters.contactConductanceWM2K &&
                  assignment.parameters.contactConductanceWM2K > 0
                    ? {}
                    : { contactConductanceWM2K: 0 }),
                },
                options: {
                  ...assignment.options,
                  ...contactState.options,
                  contactState: contactState.id,
                },
                literatureCaseId: null,
              }
            : assignment,
        ),
      };
    }),

  applyLiteratureCase: (contactPointId, caseId) =>
    set((state) => {
      const literatureCase = literatureCaseById(caseId);
      if (!literatureCase) return state;

      return {
        assignments: state.assignments.map((assignment) =>
          assignment.contactPointId === contactPointId
            ? {
                ...assignment,
                stimulusType: literatureCase.stimulusType,
                parameters: {
                  ...defaultParametersFor(literatureCase.stimulusType),
                  ...literatureCase.parameters,
                },
                options: {
                  ...defaultOptionsFor(literatureCase.stimulusType),
                  ...literatureCase.options,
                },
                literatureCaseId: literatureCase.id,
              }
            : assignment,
        ),
      };
    }),

  applyProtocolSuggestion: (contactPointId, suggestion) =>
    set((state) => ({
      assignments: state.assignments.map((assignment) =>
        assignment.contactPointId === contactPointId
          ? {
              ...assignment,
              stimulusType: "heat",
              parameters: {
                ...defaultParametersFor("heat"),
                ...suggestion.parameters,
              },
              options: {
                ...defaultOptionsFor("heat"),
                ...suggestion.options,
              },
              literatureCaseId: suggestion.caseId,
            }
          : assignment,
      ),
    })),

  applyProofLabStudyProtocol: (contactPointId, paperInputs, paperOptions) =>
    set((state) => ({
      assignments: state.assignments.map((assignment) =>
        assignment.contactPointId === contactPointId
          ? {
              ...assignment,
              stimulusType: "heat",
              parameters: {
                ...assignment.parameters,
                ...paperInputs,
              },
              options: {
                ...assignment.options,
                ...paperOptions,
              },
              literatureCaseId: null,
            }
          : assignment,
      ),
    })),

  suggestProtocolFromText: async (contactPointId, text) => {
    const suggestion = await suggestProtocolWithAssist(text, true);
    if (!suggestion) return null;

    if (suggestion.confidence === "high") {
      get().applyProtocolSuggestion(contactPointId, suggestion);
    }

    return suggestion;
  },

  loadAssistStatus: async () => {
    try {
      set({ assistStatus: await fetchAssistStatus() });
    } catch {
      set({
        assistStatus: {
          configured: false,
          provider: "rules-only",
          deployment: null,
          endpointHost: null,
          message: "Assist status unavailable outside the desktop app.",
        },
      });
    }
  },

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
          literatureCaseId: source.literatureCaseId ?? null,
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

  openValidationDashboard: () =>
    set({
      showValidationDashboard: true,
      bottomPanelTab: "proof-lab",
      bottomPanelExpanded: true,
    }),
  closeValidationDashboard: () => set({ showValidationDashboard: false }),

  openProofLab: () =>
    set({
      showProofLab: true,
      bottomPanelTab: "proof-lab",
      bottomPanelExpanded: true,
    }),
  closeProofLab: () => set({ showProofLab: false }),

  loadProofLabLibrary: async () => {
    if (get().proofLabLibraryStatus === "loading") return;
    set({ proofLabLibraryStatus: "loading" });
    try {
      const proofLabLibrary = await fetchProofLabLibrary();
      const current = get().proofLabSelectedCaseIds;
      const defaultSelection =
        current.length > 0
          ? current.filter((id) => proofLabLibrary.some((e) => e.caseId === id))
          : proofLabLibrary
              .filter((entry) => entry.modality === "heat")
              .map((entry) => entry.caseId)
              .slice(0, 1);
      set({
        proofLabLibrary,
        proofLabLibraryStatus: "ready",
        proofLabSelectedCaseIds: defaultSelection,
      });
    } catch {
      set({ proofLabLibraryStatus: "error" });
    }
  },

  toggleProofLabCase: (caseId) =>
    set((state) => {
      const selected = new Set(state.proofLabSelectedCaseIds);
      if (selected.has(caseId)) {
        selected.delete(caseId);
      } else {
        selected.add(caseId);
      }
      return { proofLabSelectedCaseIds: [...selected] };
    }),

  setProofLabSelectedCases: (caseIds) => set({ proofLabSelectedCaseIds: caseIds }),

  selectAllProofLabCases: () =>
    set((state) => ({
      proofLabSelectedCaseIds: state.proofLabLibrary.map((entry) => entry.caseId),
    })),

  clearProofLabCases: () => set({ proofLabSelectedCaseIds: [] }),

  runProofLab: async (options) => {
    const focus = options?.focus ?? true;
    const focusUi = focus
      ? {
          showProofLab: true as const,
          bottomPanelTab: "proof-lab" as const,
          bottomPanelExpanded: true as const,
        }
      : {};

    const state = get();
    const settings = SOLVER_PRESETS[state.solverPreset].settings;
    const selectedCaseIds = state.proofLabSelectedCaseIds;

    if (selectedCaseIds.length === 0) {
      if (focus) {
        set({
          proofLabStatus: "error",
          proofLabError: "Select at least one study from the research library.",
          ...focusUi,
        });
      }
      return;
    }

    const selectedEntries = state.proofLabLibrary.filter((entry) =>
      selectedCaseIds.includes(entry.caseId),
    );
    const needsHeat = selectedEntries.some((entry) => entry.requiresHeatContact);

    let contactPayload: ProofLabRequest["contact"] | undefined;
    if (needsHeat) {
      const contactId = state.selectedContactId ?? state.contactPoints[0]?.id ?? null;
      if (!contactId) {
        if (focus) {
          set({
            proofLabStatus: "error",
            proofLabError: "Add a contact point before running heat studies.",
            ...focusUi,
          });
        }
        return;
      }
      const assignment = state.assignments.find((a) => a.contactPointId === contactId);
      const contactPoint = state.contactPoints.find((c) => c.id === contactId);
      if (!assignment || !contactPoint) {
        if (focus) {
          set({
            proofLabStatus: "error",
            proofLabError: "Select a contact with stimulus settings in the sidebar.",
            ...focusUi,
          });
        }
        return;
      }
      if (assignment.stimulusType !== "heat") {
        if (focus) {
          set({
            proofLabStatus: "error",
            proofLabError:
              "Selected heat studies require a heat contact — set stimulus type to heat.",
            ...focusUi,
          });
        }
        return;
      }
      contactPayload = {
        id: contactPoint.id,
        label: contactPoint.label,
        stimulusType: assignment.stimulusType,
        parameters: assignment.parameters,
        options: assignment.options,
      };
    }

    set({
      proofLabStatus: "running",
      proofLabError: null,
      proofLabAnalysis: null,
      proofLabAnalysisStatus: "idle",
      proofLabAnalysisError: null,
      ...focusUi,
    });
    try {
      const proofLabResult = await runProofLab({
        contact: contactPayload,
        caseIds: selectedCaseIds,
        settings: {
          ...settings,
          timeStepMs: Math.max(settings.timeStepMs, 50),
          runConvergenceCheck: false,
          runSensitivity: false,
        },
      });
      set({
        proofLabResult,
        proofLabStatus: "complete",
        proofLabError: null,
        ...(focus ? { showProofLab: true } : {}),
      });
      void get().analyzeProofLab();
    } catch (error) {
      set({
        proofLabStatus: "error",
        proofLabError:
          typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : "Proof-lab comparison could not be completed.",
        ...(focus ? { showProofLab: true } : {}),
      });
    }
  },

  analyzeProofLab: async () => {
    const report = get().proofLabResult;
    if (!report) return;
    set({
      proofLabAnalysisStatus: "running",
      proofLabAnalysisError: null,
    });
    try {
      const payload: ProofLabAnalysisPayload = {
        modelVersion: report.modelVersion,
        disclosure: report.disclosure,
        cases: report.cases.map((entry) => ({
          caseId: entry.caseId,
          title: entry.title,
          citation: entry.citation,
          modality: entry.modality,
          measurementNote: entry.measurementNote,
          extractedFromPaper: entry.extractedFromPaper,
          unknowns: entry.unknowns,
          protocolInputs: entry.protocolInputs,
          paperReferenceInputs: entry.paperReferenceInputs,
          protocolMatch: computeProtocolMatch(
            entry.paperReferenceInputs,
            entry.protocolInputs,
          ),
          experimentMetrics: entry.experimentMetrics,
          windows: entry.windows.map((window) => ({
            label: window.label,
            sampleCount: window.sampleCount,
            rmseC: window.metrics.rmseC,
            maeC: window.metrics.maeC,
            signedBiasC: window.metrics.signedBiasC,
            keyDataPoints: window.keyDataPoints.slice(0, 16),
            experimentMetrics: window.experimentMetrics,
          })),
        })),
        crossValidationCases: report.crossValidationCases.map((entry) => ({
          caseId: entry.caseId,
          title: entry.title,
          citation: entry.citation,
          modality: entry.modality,
          status: entry.status,
          rmse: entry.rmse,
          mae: entry.mae,
          signedBias: entry.signedBias,
          keyDataPoints: entry.keyDataPoints,
          experimentMetrics: entry.experimentMetrics,
          caveats: entry.caveats,
        })),
      };
      const proofLabAnalysis = await analyzeProofLabWithAssist(payload, true);
      set({
        proofLabAnalysis,
        proofLabAnalysisStatus: "complete",
        proofLabAnalysisError: null,
      });
    } catch (error) {
      set({
        proofLabAnalysisStatus: "error",
        proofLabAnalysisError:
          typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : "Proof Lab AI analysis failed.",
      });
    }
  },

  runValidationSuite: async (options) => {
    set({
      validationStatus: "running",
      validationError: null,
      showValidationDashboard: true,
    });
    try {
      const settings = SOLVER_PRESETS[get().solverPreset].settings;
      const validationResult = await runValidation({
        includeSyntheticFixtures: options?.includeSyntheticFixtures ?? false,
        allowCalibration: true,
        settings: {
          ...settings,
          runConvergenceCheck: false,
          runSensitivity: false,
        },
      });
      set({
        validationResult,
        validationStatus: "complete",
        validationError: null,
        showValidationDashboard: true,
      });
    } catch (error) {
      set({
        validationStatus: "error",
        validationError:
          typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : "Validation suite could not be completed.",
        showValidationDashboard: true,
      });
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
    const thermalContacts = state.contactPoints.filter(
      (c) => {
        const stimulus = stimulusFor(c.id);
        return stimulus === "heat" || stimulus === "electrical";
      },
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
      bottomPanelTab: "results",
      bottomPanelExpanded: true,
    });

    const settings = SOLVER_PRESETS[state.solverPreset].settings;

    try {
      const [simulationResult, mechanicsResult] = await Promise.all([
        thermalContacts.length > 0
          ? runSimulation(thermalContacts, state.assignments, settings)
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
        bottomPanelTab: "results",
        bottomPanelExpanded: true,
        showValidationDashboard: false,
      });

      void (async () => {
        if (get().proofLabLibraryStatus === "idle") {
          await get().loadProofLabLibrary();
        }
        if (get().proofLabSelectedCaseIds.length > 0) {
          await get().runProofLab({ focus: false });
        }
      })();
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
      validationResult: null,
      validationStatus: "idle",
      validationError: null,
      showValidationDashboard: false,
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
