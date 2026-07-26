import { invoke } from "@tauri-apps/api/core";
import type {
  ContactPoint,
  StimulusAssignment,
} from "../store/experimentStore";

export type ThermalSample = {
  timeS: number;
  surfaceTemperatureC: number;
  basalTemperatureC: number;
  damageOmega: number;
};

export type HeatContactResult = {
  contactPointId: string;
  label: string;
  surfaceTemperatureC: number;
  durationS: number;
  peakSurfaceTemperatureC: number;
  peakBasalTemperatureC: number;
  timeTo44cS: number | null;
  arrheniusDamageOmega: number;
  riskClassification: string;
  series: ThermalSample[];
};

export type UnsupportedContact = {
  contactPointId: string;
  label: string;
  stimulusType: string;
  reason: string;
};

export type SimulationResult = {
  model: {
    name: string;
    scope: string;
    citation: string;
    disclaimer: string;
  };
  contacts: HeatContactResult[];
  unsupportedContacts: UnsupportedContact[];
};

type SimulationRequest = {
  contacts: Array<{
    id: string;
    label: string;
    stimulusType: string;
    parameters: Record<string, number>;
  }>;
};

export function buildSimulationRequest(
  contacts: ContactPoint[],
  assignments: StimulusAssignment[],
): SimulationRequest {
  return {
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
            },
          ]
        : [];
    }),
  };
}

export async function runSimulation(
  contacts: ContactPoint[],
  assignments: StimulusAssignment[],
): Promise<SimulationResult> {
  return invoke<SimulationResult>("run_simulation", {
    request: buildSimulationRequest(contacts, assignments),
  });
}
