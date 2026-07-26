import { invoke } from "@tauri-apps/api/core";
import type { ContactPoint, StimulusAssignment } from "../store/experimentStore";
import { buildSimulationRequest, type SkinProfile, type SolverSettings } from "./simulation";

export type MechLayerResult = {
  name: string;
  class: string;
  youngsModulusMpa: number;
  thicknessMm: number;
  peakStrain: number;
  peakStressKpa: number;
  compressionUm: number;
  residualStrain: number;
  yielded: boolean;
  source: string;
};

export type IndentSample = {
  timeS: number;
  indentationUm: number;
  phase: "loading" | "recovery" | "cyclic-loading" | "cyclic-recovery";
  cycle: number | null;
  appliedPressureKpa: number;
};

export type CycleSample = {
  cycle: number;
  damage: number;
  permanentShapeChangeUm: number;
  residualModulusRatio: number;
};

export type FatigueResult = {
  layer: string;
  stressAmplitudeMpa: number;
  strainAmplitude: number;
  cyclesToFailure: number;
  cyclesApplied: number;
  damageFraction: number;
  residualModulusRatio: number;
  permanentStrain: number;
  permanentShapeChangeUm: number;
  cycleSeries: CycleSample[];
  verdict: string;
};

export type MechInputs = {
  appliedPressureKpa: number;
  contactAreaMm2: number;
  holdS: number;
  recoveryS: number;
  loadingMode: string;
  cycles: number;
  frequencyHz: number;
  dutyCycle: number;
  minimumPressureFraction: number;
  simulatedDurationS: number;
};

export type MechSummary = {
  peakIndentationUm: number;
  residualIndentationUm: number;
  peakStressKpa: number;
  maxStrain: number;
  deformationPercent: number;
  totalThicknessMm: number;
  verdict: string;
};

export type MechContactResult = {
  contactPointId: string;
  label: string;
  inputs: MechInputs;
  skinProfile: SkinProfile;
  layers: MechLayerResult[];
  summary: MechSummary;
  indentationSeries: IndentSample[];
  fatigue: FatigueResult | null;
  warnings: string[];
};

export type MechModelMetadata = {
  name: string;
  version: string;
  scope: string;
  governingEquations: string[];
  citations: string[];
  disclaimer: string;
  validationStatus: string;
};

export type MechUnsupportedContact = {
  contactPointId: string;
  label: string;
  stimulusType: string;
  reason: string;
};

export type MechanicsResult = {
  model: MechModelMetadata;
  contacts: MechContactResult[];
  unsupportedContacts: MechUnsupportedContact[];
  generatedAtUnixMs: number;
};

export async function runMechanics(
  contacts: ContactPoint[],
  assignments: StimulusAssignment[],
  settings: SolverSettings,
): Promise<MechanicsResult> {
  return invoke<MechanicsResult>("run_mechanics", {
    request: buildSimulationRequest(contacts, assignments, settings),
  });
}
