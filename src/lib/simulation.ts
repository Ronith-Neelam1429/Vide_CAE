import { invoke } from "@tauri-apps/api/core";
import type {
  ContactPoint,
  StimulusAssignment,
} from "../store/experimentStore";

/** A tabulated physical constant together with its range and source. */
export type Property = {
  value: number;
  low: number;
  high: number;
  unit: string;
  source: string;
  reviewStatus: string;
};

export type TissueLayer = {
  name: string;
  thicknessM: Property;
  densityKgPerM3: Property;
  specificHeatJPerKgK: Property;
  conductivityWPerMK: Property;
  electricalConductivitySPerM: Property;
  perfusionPerS: Property;
  metabolicWPerM3: Property;
};

export type SkinProfile = {
  id: string;
  label: string;
  site: string;
  description: string;
  shallowMarkerLabel: string;
  deepMarkerLabel: string;
  category: string;
  baselineSkinC: Property;
  coreC: Property;
  bloodC: Property;
  bloodDensityKgPerM3: Property;
  bloodSpecificHeatJPerKgK: Property;
  layers: TissueLayer[];
  citations: string[];
  reviewStatus: string;
};

export type DeviceMaterial = {
  id: string;
  label: string;
  densityKgPerM3: number;
  specificHeatJPerKgK: number;
  conductivityWPerMK: number;
  microhardnessPa: number;
  source: string;
};

export type InterfaceMaterial = {
  id: string;
  label: string;
  conductivityWPerMK: number;
  defaultThicknessUm: number;
  pressureDependent: boolean;
  source: string;
};

export type DamageModel = {
  id: string;
  label: string;
  thresholdC: number;
  regimes: Array<{
    maxTemperatureC: number | null;
    frequencyFactorPerS: number;
    activationEnergyJPerMol: number;
  }>;
  citation: string;
  reviewStatus: string;
};

export type ModelCatalog = {
  skinProfiles: SkinProfile[];
  deviceMaterials: DeviceMaterial[];
  interfaceMaterials: InterfaceMaterial[];
  damageModels: DamageModel[];
};

export type VerificationCase = {
  id: string;
  name: string;
  description: string;
  reference: string;
  metric: string;
  error: number;
  tolerance: number;
  passed: boolean;
};

export type VerificationSuite = {
  modelVersion: string;
  cases: VerificationCase[];
  passed: boolean;
  summary: string;
  scope: string;
};

export type ResolvedInputs = {
  deviceSetpointC: number;
  preExposureS: number;
  exposureS: number;
  postExposureS: number;
  contactAreaMm2: number;
  deviceThicknessMm: number;
  contactPressureKpa: number;
  interfaceThicknessUm: number;
  ambientTemperatureC: number;
  baselineSkinTemperatureC: number;
  perfusionModel: string;
  deviceControl: string;
  deviceArealHeatCapacityJPerM2K: number | null;
  contactConductanceWPerM2K: number;
};

export type TimelineSegment = {
  kind: "hold" | "ramp" | "release" | "repeat";
  durationS: number;
  repetitions: number;
  dutyCycle: number | null;
  label: string;
};

export type ProtocolTimeline = {
  segments: TimelineSegment[];
};

export type ContactNetwork = {
  totalWPerM2K: number;
  interfaceFilmWPerM2K: number | null;
  solidSpotWPerM2K: number | null;
  gapWPerM2K: number | null;
  method: string;
  notes: string[];
};

export type DimensionalityCheck = {
  contactRadiusMm: number;
  penetrationDepthMm: number;
  fourierNumber: number;
  spreadingFactor: number;
  verdict: string;
  guidance: string;
};

export type ResultSummary = {
  peakSurfaceTemperatureC: number;
  peakBasalTemperatureC: number;
  peakDermalBaseTemperatureC: number;
  finalSurfaceTemperatureC: number;
  finalDeviceTemperatureC: number;
  timeTo44cS: number | null;
  basalDepthMm: number;
  dermalBaseDepthMm: number;
  omegaBasal: number;
  omegaDermalBase: number;
  cem43BasalMinutes: number;
  cem43ReferenceMinutes: number;
  thermalDoseDisagreement: boolean;
  comfortClassification: "Comfortable" | "Warm" | "Uncomfortable" | "Painful";
  damageDepthMm: number | null;
  riskClassification: string;
  peakSurfaceFluxWPerM2: number;
  totalEnergyDeliveredJ: number;
};

export type ThermalSample = {
  timeS: number;
  surfaceTemperatureC: number;
  basalTemperatureC: number;
  dermalBaseTemperatureC: number;
  deviceTemperatureC: number;
  damageOmega: number;
  /** Blood-flow / baseline at the basal reporting depth. */
  perfusionFold: number;
  /** Controller heat input; zero for ideal and passive devices. */
  controllerFluxWPerM2: number;
  /** Whether a regulated controller hit its configured power ceiling. */
  controllerSaturated: boolean;
  surfaceFluxWPerM2: number;
  phase: "baseline" | "exposure" | "cooling" | "hold" | "ramp" | "release";
};

export type DepthSample = {
  depthMm: number;
  peakTemperatureC: number;
  finalTemperatureC: number;
  damageOmega: number;
  layer: string;
};

export type EnergyReport = {
  surfaceInJPerM2: number;
  coreOutJPerM2: number;
  perfusionOutJPerM2: number;
  metabolicInJPerM2: number;
  storedJPerM2: number;
  residualJPerM2: number;
  relativeResidual: number;
  balanced: boolean;
};

export type ResultBounds = {
  nominalPeakBasalC: number;
  lateralBoundPeakBasalC: number;
  lateralBoundOmega: number;
  sensitivityLowPeakBasalC: number;
  sensitivityHighPeakBasalC: number;
  note: string;
};

export type SensitivityEntry = {
  parameter: string;
  unit: string;
  baseline: number;
  low: number;
  high: number;
  peakBasalLowC: number;
  peakBasalHighC: number;
  omegaLow: number;
  omegaHigh: number;
  peakBasalSpanC: number;
};

export type ConvergenceMetric = {
  name: string;
  unit: string;
  coarse: number;
  medium: number;
  fine: number;
  relativeChange: number;
  observedOrder: number | null;
  extrapolated: number | null;
  tolerance: number;
  converged: boolean;
};

export type ConvergenceReport = {
  refinementRatio: number;
  metrics: ConvergenceMetric[];
  converged: boolean;
  note: string;
};

export type ResolvedSolverSettings = {
  surfaceCellUm: number;
  maxCellUm: number;
  growthRatio: number;
  timeStepMs: number;
  scheme: string;
  cellCount: number;
  stepCount: number;
  domainDepthMm: number;
  solverDimension: string;
  solverDimensionRequested: string;
  radialCellCount: number | null;
  radialDomainMm: number | null;
};

export type RadialSample = {
  radiusMm: number;
  peakSurfaceTemperatureC: number;
  finalSurfaceTemperatureC: number;
};

export type ElectricalLayerResult = {
  name: string;
  depthStartMm: number;
  depthEndMm: number;
  conductivitySPerM: number;
  conductivityConfidence: string;
  currentDensityAPerM2: number;
  powerDensityWPerM3: number;
  voltageDropV: number;
};

export type NerveActivationResult = {
  pulseDurationUs: number;
  appliedCurrentMa: number;
  thresholdCurrentMa: number;
  rheobaseMa: number;
  chronaxieUs: number;
  activationMargin: number;
  classification: "Sub-threshold" | "Perceptible" | "Motor stimulation" | "Painful";
  confidence: string;
  citation: string;
};

export type ElectricalReport = {
  waveformType: string;
  driveMode: string;
  peakCurrentMa: number;
  rmsCurrentMa: number;
  appliedVoltageV: number;
  tissueResistanceOhm: number;
  interfaceImpedanceOhm: number;
  totalImpedanceOhm: number;
  currentDensityAPerM2: number;
  totalPowerW: number;
  chargePerPulseUc: number;
  chargeDensityUcPerCm2: number;
  layers: ElectricalLayerResult[];
  nerveActivation: NerveActivationResult;
  returnPathAssumption: string;
  confidence: string;
  citation: string;
};

export type HeatContactResult = {
  contactPointId: string;
  label: string;
  inputs: ResolvedInputs;
  protocolTimeline: ProtocolTimeline;
  skinProfile: SkinProfile;
  deviceMaterial: DeviceMaterial;
  interfaceMaterial: InterfaceMaterial;
  damageModel: DamageModel;
  contact: ContactNetwork;
  dimensionality: DimensionalityCheck;
  summary: ResultSummary;
  series: ThermalSample[];
  depthProfile: DepthSample[];
  energy: EnergyReport;
  bounds: ResultBounds;
  sensitivity: SensitivityEntry[];
  convergence: ConvergenceReport | null;
  solver: ResolvedSolverSettings;
  warnings: string[];
  radialProfile: RadialSample[];
  electrical?: ElectricalReport;
};

export type UnsupportedContact = {
  contactPointId: string;
  label: string;
  stimulusType: string;
  reason: string;
};

export type ModelMetadata = {
  name: string;
  version: string;
  scope: string;
  governingEquations: string[];
  numerics: string;
  citations: string[];
  disclaimer: string;
  validationStatus: string;
};

export type RunManifest = {
  modelVersion: string;
  generatedAtUnixMs: number;
  contactCount: number;
  verification: VerificationSuite;
};

export type SimulationResult = {
  model: ModelMetadata;
  contacts: HeatContactResult[];
  unsupportedContacts: UnsupportedContact[];
  manifest: RunManifest;
};

export type SolverSettings = {
  surfaceCellUm: number;
  maxCellUm: number;
  growthRatio: number;
  timeStepMs: number;
  runConvergenceCheck: boolean;
  runSensitivity: boolean;
};

/**
 * Named accuracy levels, so choosing a fidelity does not require reasoning
 * about cell sizes and timesteps.
 */
export const SOLVER_PRESETS = {
  draft: {
    label: "Draft",
    description: "Coarse mesh, no convergence or sensitivity study. Fastest iteration.",
    settings: {
      surfaceCellUm: 12,
      maxCellUm: 800,
      growthRatio: 1.18,
      timeStepMs: 50,
      runConvergenceCheck: false,
      runSensitivity: false,
    },
  },
  balanced: {
    label: "Balanced",
    description: "Default fidelity with convergence and sensitivity checks enabled.",
    settings: {
      surfaceCellUm: 5,
      maxCellUm: 400,
      growthRatio: 1.12,
      timeStepMs: 20,
      runConvergenceCheck: true,
      runSensitivity: true,
    },
  },
  publication: {
    label: "Publication",
    description: "Fine mesh and timestep. Slowest, and what a reported result should use.",
    settings: {
      surfaceCellUm: 2.5,
      maxCellUm: 200,
      growthRatio: 1.08,
      timeStepMs: 10,
      runConvergenceCheck: true,
      runSensitivity: true,
    },
  },
} as const satisfies Record<
  string,
  { label: string; description: string; settings: SolverSettings }
>;

export type SolverPresetId = keyof typeof SOLVER_PRESETS;

type SimulationRequest = {
  contacts: Array<{
    id: string;
    label: string;
    stimulusType: string;
    parameters: Record<string, number>;
    options: Record<string, string>;
  }>;
  settings: SolverSettings;
};

export function buildSimulationRequest(
  contacts: ContactPoint[],
  assignments: StimulusAssignment[],
  settings: SolverSettings,
): SimulationRequest {
  return {
    settings,
    contacts: contacts.flatMap((contact) => {
      const assignment = assignments.find(
        (candidate) => candidate.contactPointId === contact.id,
      );

      return assignment
        ? [
            {
              id: contact.id,
              label: contact.label,
              stimulusType: assignment.stimulusType,
              parameters: assignment.parameters,
              options: assignment.options,
            },
          ]
        : [];
    }),
  };
}

export async function runSimulation(
  contacts: ContactPoint[],
  assignments: StimulusAssignment[],
  settings: SolverSettings,
): Promise<SimulationResult> {
  return invoke<SimulationResult>("run_simulation", {
    request: buildSimulationRequest(contacts, assignments, settings),
  });
}

/** Fetch the tissue/material tables the solver uses, so the UI cannot drift. */
export async function fetchModelCatalog(): Promise<ModelCatalog> {
  return invoke<ModelCatalog>("model_catalog");
}

export async function verifySolver(): Promise<VerificationSuite> {
  return invoke<VerificationSuite>("verify_solver");
}

export type ValidationSplit = "calibration" | "holdout";
export type MeasurementTarget = "skin_surface" | "thermode_interface";
export type CaseAvailability =
  | "ready"
  | "awaiting_contact_site_series"
  | "protocol_only";

export type MeasuredSample = {
  timeS: number;
  temperatureC: number;
};

export type ComparisonPoint = {
  timeS: number;
  measuredC: number;
  predictedC: number;
  residualC: number;
};

export type ComparisonMetrics = {
  sampleCount: number;
  timeAlignment: string;
  rmseC: number | null;
  maeC: number | null;
  signedBiasC: number | null;
  peakTemperatureErrorC: number | null;
  timeToPeakErrorS: number | null;
  unavailableReason: string | null;
};

export type LockedParameter = {
  key: string;
  value: number;
  unit: string;
  source: string;
};

export type ValidationCaseResult = {
  caseId: string;
  title: string;
  split: ValidationSplit;
  synthetic: boolean;
  availability: CaseAvailability;
  availabilityNote: string;
  citation: string;
  measurementTarget: MeasurementTarget;
  protocolComplete: boolean;
  measuredSeriesChecksum: string | null;
  lockedParameters: LockedParameter[];
  predictedSeries: ThermalSample[];
  measuredSeries: MeasuredSample[];
  comparison: ComparisonPoint[];
  metrics: ComparisonMetrics;
  caveats: string[];
  peakPredictedSurfaceC: number;
  peakMeasuredC: number | null;
};

export type ValidationSuiteReport = {
  modelVersion: string;
  generatedAtUnixMs: number;
  includeSyntheticFixtures: boolean;
  calibrated: boolean;
  lockedParameters: LockedParameter[];
  cases: ValidationCaseResult[];
  disclosure: string;
  sourceAudit: string;
};

export type ValidationRequest = {
  includeSyntheticFixtures?: boolean;
  allowCalibration?: boolean;
  settings?: SolverSettings;
};

export async function runValidation(
  request: ValidationRequest = {},
): Promise<ValidationSuiteReport> {
  return invoke<ValidationSuiteReport>("run_validation", {
    request: {
      includeSyntheticFixtures: request.includeSyntheticFixtures ?? false,
      allowCalibration: request.allowCalibration ?? true,
      settings: request.settings ?? {
        surfaceCellUm: 5,
        maxCellUm: 400,
        growthRatio: 1.12,
        timeStepMs: 20,
        runConvergenceCheck: false,
        runSensitivity: false,
      },
    },
  });
}

export type ExperimentMetric = {
  id: string;
  label: string;
  unit: string;
  paperValue: number | null;
  videValue: number | null;
  absoluteError: number | null;
  relativeErrorPct: number | null;
  category: "checkpoint" | "derived" | "summary" | "parameter" | string;
  description: string | null;
  note: string | null;
};

export type DataPointCompare = {
  label: string;
  x: number;
  xLabel: string;
  xUnit: string;
  paperValue: number;
  videValue: number;
  absoluteError: number;
  relativeErrorPct: number | null;
  unit: string;
};

export type WindowComparison = {
  label: string;
  startS: number;
  endS: number;
  sampleCount: number;
  metrics: ComparisonMetrics;
  comparison: ComparisonPoint[];
  keyDataPoints: DataPointCompare[];
  experimentMetrics: ExperimentMetric[];
  peakMeasuredC: number | null;
  peakPredictedC: number | null;
};

export type ProofLabCaseResult = {
  caseId: string;
  title: string;
  citation: string;
  modality: "heat" | string;
  measurementTarget: MeasurementTarget;
  measurementNote: string;
  contactLabel: string;
  protocolInputs: Record<string, number>;
  protocolOptions: Record<string, string>;
  paperReferenceInputs: Record<string, number>;
  paperReferenceOptions: Record<string, string>;
  usesUserContact: boolean;
  predictedSeries: ThermalSample[];
  measuredSeries: MeasuredSample[];
  windows: WindowComparison[];
  experimentMetrics: ExperimentMetric[];
  extractedFromPaper: string[];
  unknowns: string[];
  caveats: string[];
};

export type CrossValidationPoint = {
  x: number;
  measured: number;
  predicted: number;
  absoluteError: number;
  relativeErrorPct: number | null;
};

export type CrossValidationCase = {
  caseId: string;
  modality: "mechanical" | "electrical";
  title: string;
  citation: string;
  status: string;
  xLabel: string;
  xUnit: string;
  metricLabel: string;
  metricUnit: string;
  rmse: number;
  mae: number;
  signedBias: number;
  points: CrossValidationPoint[];
  keyDataPoints: DataPointCompare[];
  experimentMetrics: ExperimentMetric[];
  caveats: string[];
};

export type ProofLabReport = {
  modelVersion: string;
  generatedAtUnixMs: number;
  disclosure: string;
  selectedCaseIds: string[];
  cases: ProofLabCaseResult[];
  crossValidationCases: CrossValidationCase[];
};

export type ProofLabLibraryEntry = {
  caseId: string;
  title: string;
  citation: string;
  modality: "heat" | "mechanical" | "electrical" | string;
  measurementTarget: MeasurementTarget | null;
  measurementSummary: string;
  site: string;
  setpointC: number | null;
  durationS: number | null;
  status: string;
  requiresHeatContact: boolean;
  highlights: string[];
  unknowns: string[];
};

export type ProofLabRequest = {
  contact?: {
    id: string;
    label: string;
    stimulusType: string;
    parameters: Record<string, number>;
    options: Record<string, string>;
  };
  caseIds: string[];
  settings?: SolverSettings;
};

export async function fetchProofLabLibrary(): Promise<ProofLabLibraryEntry[]> {
  return invoke<ProofLabLibraryEntry[]>("list_proof_lab_library_cmd");
}

export async function runProofLab(request: ProofLabRequest): Promise<ProofLabReport> {
  return invoke<ProofLabReport>("run_proof_lab_validation", {
    request: {
      contact: request.contact,
      caseIds: request.caseIds,
      settings: request.settings ?? {
        surfaceCellUm: 5,
        maxCellUm: 400,
        growthRatio: 1.12,
        timeStepMs: 50,
        runConvergenceCheck: false,
        runSensitivity: false,
      },
    },
  });
}
