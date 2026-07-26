import type { StimulusOptions, StimulusParameters } from "./stimuli";

export type LiteratureCaseAvailability =
  | "ready"
  | "awaiting_contact_site_series"
  | "protocol_only";

export type LiteratureCaseSplit = "calibration" | "holdout";

/** Published or protocol-only benchmark aligned with benchmarks/heat/cases/*.json */
export type LiteratureCase = {
  id: string;
  split: LiteratureCaseSplit;
  label: string;
  shortDescription: string;
  citation: string;
  doi: string | null;
  availability: LiteratureCaseAvailability;
  availabilityNote: string;
  site: string;
  stimulusType: "heat";
  parameters: StimulusParameters;
  options: StimulusOptions;
  /** Keywords for protocol assistant matching */
  keywords: string[];
};

export const LITERATURE_CASES: LiteratureCase[] = [
  {
    id: "pmed-forearm-cheps-10s",
    split: "calibration",
    label: "PMED · CHEPS 10 s (45 °C)",
    shortDescription:
      "Medoc Pathway CHEPS on volar forearm — 27 mm disc, 10 s hold, literature calibration case.",
    citation:
      "Gouverneur et al. (2024). An Experimental and Clinical Physiological Signal Dataset for Automated Pain Recognition. Scientific Data.",
    doi: "10.1038/s41597-024-03878-w",
    availability: "awaiting_contact_site_series",
    availabilityNote:
      "Contact-site skin T(t) not bundled; thermode and wrist E4 are not like-for-like with simulated skin surface.",
    site: "volar-forearm",
    stimulusType: "heat",
    parameters: {
      temperatureC: 45,
      durationS: 10,
      postExposureS: 20,
      contactAreaMm2: 572.555,
      interfaceThicknessUm: 20,
      contactPressureKpa: 5,
      ambientTemperatureC: 22,
      baselineSkinTemperatureC: 32,
      deviceThicknessMm: 2,
      contactConductanceWM2K: 0,
      controllerMaxFluxWM2: 5000,
    },
    options: {
      skinProfileId: "volar-forearm",
      interfaceMaterialId: "dry-contact",
      deviceMaterialId: "aluminium-6061",
      deviceControl: "ideal",
      damageModelId: "henriques-1947",
    },
    keywords: [
      "pmed",
      "cheps",
      "medoc",
      "painmonit",
      "forearm",
      "10s",
      "10 s",
      "45",
      "calibration",
    ],
  },
  {
    id: "mayrovitz-forearm-local-42c",
    split: "holdout",
    label: "Mayrovitz · local heater 42 °C",
    shortDescription:
      "20 mm aluminium local heater on volar forearm, ramp to 42 °C hold — hold-out protocol.",
    citation:
      "Mayrovitz et al. (2020). Effects of local forearm skin heating on skin properties. Clinical Physiology and Functional Imaging.",
    doi: null,
    availability: "awaiting_contact_site_series",
    availabilityNote:
      "Protocol locked from publication summary; raw contact-site T(t) CSV not yet ingested.",
    site: "volar-forearm",
    stimulusType: "heat",
    parameters: {
      temperatureC: 42,
      durationS: 720,
      postExposureS: 60,
      contactAreaMm2: 314.159,
      interfaceThicknessUm: 20,
      contactPressureKpa: 3,
      ambientTemperatureC: 22,
      baselineSkinTemperatureC: 35,
      deviceThicknessMm: 2,
      contactConductanceWM2K: 0,
      controllerMaxFluxWM2: 5000,
    },
    options: {
      skinProfileId: "volar-forearm",
      interfaceMaterialId: "dry-contact",
      deviceMaterialId: "aluminium-6061",
      deviceControl: "ideal",
      damageModelId: "henriques-1947",
    },
    keywords: [
      "mayrovitz",
      "local heat",
      "42",
      "forearm",
      "aluminium",
      "holdout",
      "hold-out",
      "12 min",
    ],
  },
];

export function literatureCaseById(id: string): LiteratureCase | undefined {
  return LITERATURE_CASES.find((entry) => entry.id === id);
}

export function listLiteratureCases(): LiteratureCase[] {
  return LITERATURE_CASES;
}
