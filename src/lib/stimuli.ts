export type BuiltinStimulusType =
  | "heat"
  | "cold"
  | "electrical"
  | "pressure";

export type StimulusType = BuiltinStimulusType | (string & {});

export type StimulusParameters = Record<string, number>;

export type StimulusField = {
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
};

export type StimulusDefinition = {
  type: BuiltinStimulusType;
  label: string;
  description: string;
  fields: StimulusField[];
};

export const BUILTIN_STIMULI: StimulusDefinition[] = [
  {
    type: "heat",
    label: "Heat",
    description: "Thermal contact heating of skin",
    fields: [
      {
        key: "temperatureC",
        label: "Target temperature",
        unit: "°C",
        min: 20,
        max: 100,
        step: 0.5,
        defaultValue: 44,
      },
      {
        key: "durationS",
        label: "Duration",
        unit: "s",
        min: 0.1,
        max: 600,
        step: 0.1,
        defaultValue: 10,
      },
      {
        key: "contactAreaMm2",
        label: "Contact area",
        unit: "mm²",
        min: 1,
        max: 5000,
        step: 1,
        defaultValue: 25,
      },
    ],
  },
  {
    type: "cold",
    label: "Cold",
    description: "Thermal contact cooling of skin",
    fields: [
      {
        key: "temperatureC",
        label: "Target temperature",
        unit: "°C",
        min: -20,
        max: 30,
        step: 0.5,
        defaultValue: 4,
      },
      {
        key: "durationS",
        label: "Duration",
        unit: "s",
        min: 0.1,
        max: 600,
        step: 0.1,
        defaultValue: 30,
      },
      {
        key: "contactAreaMm2",
        label: "Contact area",
        unit: "mm²",
        min: 1,
        max: 5000,
        step: 1,
        defaultValue: 25,
      },
    ],
  },
  {
    type: "electrical",
    label: "Electrical Current",
    description: "Applied current at the contact site",
    fields: [
      {
        key: "currentMa",
        label: "Current",
        unit: "mA",
        min: 0.01,
        max: 100,
        step: 0.01,
        defaultValue: 1,
      },
      {
        key: "frequencyHz",
        label: "Frequency",
        unit: "Hz",
        min: 0,
        max: 10000,
        step: 1,
        defaultValue: 50,
      },
      {
        key: "durationS",
        label: "Duration",
        unit: "s",
        min: 0.1,
        max: 600,
        step: 0.1,
        defaultValue: 5,
      },
      {
        key: "contactAreaMm2",
        label: "Contact area",
        unit: "mm²",
        min: 1,
        max: 5000,
        step: 1,
        defaultValue: 10,
      },
    ],
  },
  {
    type: "pressure",
    label: "Pressure",
    description: "Mechanical pressure at the contact site",
    fields: [
      {
        key: "pressureKpa",
        label: "Pressure",
        unit: "kPa",
        min: 0.1,
        max: 500,
        step: 0.1,
        defaultValue: 20,
      },
      {
        key: "durationS",
        label: "Duration",
        unit: "s",
        min: 0.1,
        max: 600,
        step: 0.1,
        defaultValue: 10,
      },
      {
        key: "contactAreaMm2",
        label: "Contact area",
        unit: "mm²",
        min: 1,
        max: 5000,
        step: 1,
        defaultValue: 25,
      },
    ],
  },
];

export function getStimulusDefinition(
  type: StimulusType,
): StimulusDefinition | undefined {
  return BUILTIN_STIMULI.find((s) => s.type === type);
}

export function defaultParametersFor(
  type: StimulusType,
): StimulusParameters {
  const def = getStimulusDefinition(type);
  if (!def) return {};
  return Object.fromEntries(
    def.fields.map((field) => [field.key, field.defaultValue]),
  );
}

export function stimulusLabel(type: StimulusType): string {
  return getStimulusDefinition(type)?.label ?? type;
}
