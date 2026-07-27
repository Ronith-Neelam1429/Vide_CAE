import type { StimulusOptions, StimulusParameters } from "./stimuli";

export type ContactStateId = "dry" | "sweat" | "gel";

export type ContactState = {
  id: ContactStateId;
  label: string;
  shortLabel: string;
  description: string;
  options: Pick<StimulusOptions, "interfaceMaterialId">;
  parameters: Pick<StimulusParameters, "interfaceThicknessUm" | "contactPressureKpa">;
};

export const CONTACT_STATES: ContactState[] = [
  {
    id: "dry",
    label: "Dry contact",
    shortLabel: "Dry",
    description: "Pressure-sensitive contact through microscopic air gaps.",
    options: { interfaceMaterialId: "dry-contact" },
    parameters: { interfaceThicknessUm: 20, contactPressureKpa: 5 },
  },
  {
    id: "sweat",
    label: "Light sweat",
    shortLabel: "Sweat",
    description: "Thin water film with higher heat transfer than dry contact.",
    options: { interfaceMaterialId: "water-film" },
    parameters: { interfaceThicknessUm: 30, contactPressureKpa: 3 },
  },
  {
    id: "gel",
    label: "Gel pad",
    shortLabel: "Gel",
    description: "Conforming hydrogel layer with stable film conductance.",
    options: { interfaceMaterialId: "hydrogel" },
    parameters: { interfaceThicknessUm: 250, contactPressureKpa: 3 },
  },
];

export function contactStateForOptions(options: StimulusOptions): ContactStateId {
  const stored = options.contactState;
  if (stored === "dry" || stored === "sweat" || stored === "gel") return stored;

  switch (options.interfaceMaterialId) {
    case "water-film":
      return "sweat";
    case "hydrogel":
      return "gel";
    default:
      return "dry";
  }
}

export function contactStateById(id: string): ContactState | undefined {
  return CONTACT_STATES.find((state) => state.id === id);
}
