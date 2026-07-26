export type BuiltinStimulusType =
  | "heat"
  | "cold"
  | "electrical"
  | "pressure";

export type StimulusType = BuiltinStimulusType | (string & {});

export type StimulusParameters = Record<string, number>;
/** Non-numeric selections such as which skin profile or interface to use. */
export type StimulusOptions = Record<string, string>;

/**
 * Fields are grouped so the panel can lead with the handful of inputs that
 * define an experiment and keep the rest one click away.
 */
export type FieldGroup = "essential" | "contact" | "device" | "environment";

export type StimulusNumberField = {
  kind: "number";
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  group: FieldGroup;
  help?: string;
};

/** Which backend table supplies this field's options, if any. */
export type CatalogSource =
  | "skinProfiles"
  | "deviceMaterials"
  | "interfaceMaterials"
  | "damageModels";

export type StimulusChoiceField = {
  kind: "choice";
  key: string;
  label: string;
  defaultValue: string;
  group: FieldGroup;
  help?: string;
  catalog?: CatalogSource;
  choices?: Array<{ value: string; label: string }>;
};

export type StimulusField = StimulusNumberField | StimulusChoiceField;

export type StimulusDefinition = {
  type: BuiltinStimulusType;
  label: string;
  description: string;
  implemented: boolean;
  fields: StimulusField[];
};

export const FIELD_GROUP_LABELS: Record<FieldGroup, string> = {
  essential: "Exposure",
  contact: "Contact interface",
  device: "Device",
  environment: "Subject and environment",
};

const HEAT_FIELDS: StimulusField[] = [
  {
    kind: "number",
    key: "temperatureC",
    label: "Device temperature",
    unit: "°C",
    min: 20,
    max: 150,
    step: 0.5,
    defaultValue: 44,
    group: "essential",
    help: "Temperature of the device face, not of the skin. Skin reaches less than this because the contact has finite conductance.",
  },
  {
    kind: "number",
    key: "durationS",
    label: "Contact duration",
    unit: "s",
    min: 0.1,
    max: 3600,
    step: 0.1,
    defaultValue: 10,
    group: "essential",
  },
  {
    kind: "number",
    key: "postExposureS",
    label: "Post-contact window",
    unit: "s",
    min: 0,
    max: 3600,
    step: 1,
    defaultValue: 60,
    group: "essential",
    help: "Skin keeps accumulating damage while it cools. Without this window the damage integral is under-reported.",
  },
  {
    kind: "number",
    key: "contactAreaMm2",
    label: "Contact area",
    unit: "mm²",
    min: 0.1,
    max: 50000,
    step: 1,
    defaultValue: 400,
    group: "contact",
    help: "Drives whether a depth-only model is defensible. Small patches lose heat sideways.",
  },
  {
    kind: "choice",
    key: "interfaceMaterialId",
    label: "Interface",
    defaultValue: "dry-contact",
    group: "contact",
    catalog: "interfaceMaterials",
    help: "What sits between the device and the skin.",
  },
  {
    kind: "number",
    key: "interfaceThicknessUm",
    label: "Interface thickness",
    unit: "µm",
    min: 0.1,
    max: 5000,
    step: 1,
    defaultValue: 20,
    group: "contact",
  },
  {
    kind: "number",
    key: "contactPressureKpa",
    label: "Contact pressure",
    unit: "kPa",
    min: 0,
    max: 500,
    step: 0.5,
    defaultValue: 5,
    group: "contact",
    help: "Only affects a dry contact; a conforming film ignores it.",
  },
  {
    kind: "number",
    key: "contactConductanceWM2K",
    label: "Measured conductance",
    unit: "W/(m²·K)",
    min: 0,
    max: 100000,
    step: 10,
    defaultValue: 0,
    group: "contact",
    help: "Leave at 0 to estimate from the interface and pressure. Set it if you have measured the contact.",
  },
  {
    kind: "choice",
    key: "deviceControl",
    label: "Thermal control",
    defaultValue: "ideal",
    group: "device",
    choices: [
      { value: "ideal", label: "Ideal — holds setpoint exactly" },
      { value: "passive", label: "Passive — thermal mass, no power" },
      { value: "regulated", label: "Regulated — power-limited controller" },
    ],
    help: "'Ideal' assumes a controller with unlimited power, which flatters the result.",
  },
  {
    kind: "choice",
    key: "deviceMaterialId",
    label: "Device material",
    defaultValue: "aluminium-6061",
    group: "device",
    catalog: "deviceMaterials",
  },
  {
    kind: "number",
    key: "deviceThicknessMm",
    label: "Device thickness",
    unit: "mm",
    min: 0.01,
    max: 200,
    step: 0.1,
    defaultValue: 2,
    group: "device",
    help: "Sets the device's heat capacity. Ignored when control is ideal.",
  },
  {
    kind: "number",
    key: "controllerMaxFluxWM2",
    label: "Controller power limit",
    unit: "W/m²",
    min: 0,
    max: 100000,
    step: 100,
    defaultValue: 5000,
    group: "device",
  },
  {
    kind: "choice",
    key: "skinProfileId",
    label: "Skin site",
    defaultValue: "volar-forearm",
    group: "environment",
    catalog: "skinProfiles",
    help: "Sets layer thicknesses, perfusion and baseline temperature.",
  },
  {
    kind: "number",
    key: "baselineSkinTemperatureC",
    label: "Baseline skin temperature",
    unit: "°C",
    min: 15,
    max: 40,
    step: 0.1,
    defaultValue: 33,
    group: "environment",
  },
  {
    kind: "number",
    key: "ambientTemperatureC",
    label: "Ambient temperature",
    unit: "°C",
    min: -20,
    max: 50,
    step: 0.5,
    defaultValue: 22,
    group: "environment",
  },
  {
    kind: "choice",
    key: "damageModelId",
    label: "Damage kinetics",
    defaultValue: "henriques-1947",
    group: "environment",
    catalog: "damageModels",
  },
];

const PRESSURE_FIELDS: StimulusField[] = [
  {
    kind: "number",
    key: "appliedPressureKpa",
    label: "Applied contact pressure",
    unit: "kPa",
    min: 0,
    max: 300000,
    step: 1,
    defaultValue: 50,
    group: "essential",
    help: "Normal pressure the device presses into the tissue with. Skin contact is tens of kPa; bone fatigue needs MPa-level stress (1 MPa = 1000 kPa).",
  },
  {
    kind: "number",
    key: "contactAreaMm2",
    label: "Contact area",
    unit: "mm²",
    min: 0.1,
    max: 50000,
    step: 1,
    defaultValue: 400,
    group: "essential",
    help: "Sets the contact radius, which controls how deep the load reaches (Boussinesq depth-decay).",
  },
  {
    kind: "number",
    key: "holdDurationS",
    label: "Load hold",
    unit: "s",
    min: 0.1,
    max: 86400,
    step: 1,
    defaultValue: 30,
    group: "essential",
    help: "How long the load is held. Viscoelastic tissue keeps creeping while held.",
  },
  {
    kind: "number",
    key: "recoveryS",
    label: "Recovery window",
    unit: "s",
    min: 0,
    max: 86400,
    step: 1,
    defaultValue: 30,
    group: "essential",
    help: "Time after release, over which recoverable deformation relaxes back.",
  },
  {
    kind: "choice",
    key: "loadingMode",
    label: "Loading mode",
    defaultValue: "static",
    group: "essential",
    choices: [
      { value: "static", label: "Static — single hold and release" },
      { value: "cyclic", label: "Cyclic — repeated load (bone fatigue)" },
    ],
    help: "Cyclic loading evaluates fatigue damage and shape change in load-bearing bone.",
  },
  {
    kind: "number",
    key: "cycles",
    label: "Number of cycles",
    unit: "cycles",
    min: 1,
    max: 1e9,
    step: 1000,
    defaultValue: 100000,
    group: "essential",
    help: "Total load cycles applied (cyclic mode only).",
  },
  {
    kind: "number",
    key: "frequencyHz",
    label: "Loading frequency",
    unit: "Hz",
    min: 0.01,
    max: 100,
    step: 0.1,
    defaultValue: 1,
    group: "essential",
    help: "Cycles per second (cyclic mode only).",
  },
  {
    kind: "number",
    key: "dutyCycle",
    label: "Load portion",
    unit: "%",
    min: 1,
    max: 99,
    step: 1,
    defaultValue: 50,
    group: "essential",
    help: "Percent of each repeated cycle spent at the applied pressure. The remainder is recovery.",
  },
  {
    kind: "number",
    key: "minimumPressureFraction",
    label: "Retained preload",
    unit: "%",
    min: 0,
    max: 95,
    step: 1,
    defaultValue: 0,
    group: "essential",
    help: "Pressure retained between cycles as a percent of the applied pressure; 0% fully releases the contact.",
  },
  {
    kind: "choice",
    key: "skinProfileId",
    label: "Tissue",
    defaultValue: "volar-forearm",
    group: "environment",
    catalog: "skinProfiles",
    help: "The organic material being loaded. Choose a bone tissue to study cyclic fatigue.",
  },
];

const PLACEHOLDER_NOTE =
  "Not implemented. The heat path must be validated against published data before other stimulus models are added.";

export const BUILTIN_STIMULI: StimulusDefinition[] = [
  {
    type: "heat",
    label: "Heat",
    description: "Thermal contact heating through a finite contact conductance",
    implemented: true,
    fields: HEAT_FIELDS,
  },
  {
    type: "cold",
    label: "Cold",
    description: PLACEHOLDER_NOTE,
    implemented: false,
    fields: [],
  },
  {
    type: "electrical",
    label: "Electrical Current",
    description: PLACEHOLDER_NOTE,
    implemented: false,
    fields: [],
  },
  {
    type: "pressure",
    label: "Pressure / mechanical load",
    description:
      "Normal-contact compression: viscoelastic deformation over time, permanent set past yield, and cyclic fatigue for bone.",
    implemented: true,
    fields: PRESSURE_FIELDS,
  },
];

export type StimulusPreset = {
  id: string;
  label: string;
  description: string;
  stimulusType: BuiltinStimulusType;
  parameters: StimulusParameters;
  options: StimulusOptions;
};

/** Complete, self-consistent starting points for common scenarios. */
export const STIMULUS_PRESETS: StimulusPreset[] = [
  {
    id: "wearable-band",
    label: "Wearable band, worn continuously",
    description: "43 °C regulated band on the forearm through a silicone pad for 30 minutes.",
    stimulusType: "heat",
    parameters: {
      temperatureC: 43,
      durationS: 1800,
      postExposureS: 300,
      contactAreaMm2: 400,
      interfaceThicknessUm: 500,
      contactPressureKpa: 3,
      contactConductanceWM2K: 0,
      deviceThicknessMm: 3,
      controllerMaxFluxWM2: 2000,
      baselineSkinTemperatureC: 33,
      ambientTemperatureC: 22,
    },
    options: {
      skinProfileId: "volar-forearm",
      deviceMaterialId: "silicone-rubber",
      interfaceMaterialId: "silicone-pad",
      deviceControl: "regulated",
      damageModelId: "henriques-1947",
    },
  },
  {
    id: "handheld-enclosure",
    label: "Handheld enclosure, warm to the grip",
    description: "48 °C aluminium surface gripped by the palm for a minute with no active heating.",
    stimulusType: "heat",
    parameters: {
      temperatureC: 48,
      durationS: 60,
      postExposureS: 120,
      contactAreaMm2: 1200,
      interfaceThicknessUm: 15,
      contactPressureKpa: 15,
      contactConductanceWM2K: 0,
      deviceThicknessMm: 2,
      controllerMaxFluxWM2: 5000,
      baselineSkinTemperatureC: 33.5,
      ambientTemperatureC: 22,
    },
    options: {
      skinProfileId: "palm",
      deviceMaterialId: "aluminium-6061",
      interfaceMaterialId: "dry-contact",
      deviceControl: "passive",
      damageModelId: "henriques-1947",
    },
  },
  {
    id: "therapy-pad",
    label: "Thermal therapy pad",
    description: "45 °C gel-coupled pad on the upper back for 10 minutes.",
    stimulusType: "heat",
    parameters: {
      temperatureC: 45,
      durationS: 600,
      postExposureS: 300,
      contactAreaMm2: 5000,
      interfaceThicknessUm: 250,
      contactPressureKpa: 2,
      contactConductanceWM2K: 0,
      deviceThicknessMm: 5,
      controllerMaxFluxWM2: 3000,
      baselineSkinTemperatureC: 34,
      ambientTemperatureC: 22,
    },
    options: {
      skinProfileId: "upper-back",
      deviceMaterialId: "silicone-rubber",
      interfaceMaterialId: "hydrogel",
      deviceControl: "regulated",
      damageModelId: "henriques-1947",
    },
  },
  {
    id: "hot-surface-touch",
    label: "Brief hot-surface touch",
    description: "One-second fingertip contact with a 70 °C metal surface.",
    stimulusType: "heat",
    parameters: {
      temperatureC: 70,
      durationS: 1,
      postExposureS: 30,
      contactAreaMm2: 100,
      interfaceThicknessUm: 15,
      contactPressureKpa: 20,
      contactConductanceWM2K: 0,
      deviceThicknessMm: 10,
      controllerMaxFluxWM2: 5000,
      baselineSkinTemperatureC: 32,
      ambientTemperatureC: 22,
    },
    options: {
      skinProfileId: "fingertip",
      deviceMaterialId: "stainless-316",
      interfaceMaterialId: "dry-contact",
      deviceControl: "passive",
      damageModelId: "henriques-1947",
    },
  },
  {
    id: "threshold-probe",
    label: "Burn-threshold probe",
    description: "Gel-coupled 55 °C probe held on the forearm for 30 s, the classic threshold geometry.",
    stimulusType: "heat",
    parameters: {
      temperatureC: 55,
      durationS: 30,
      postExposureS: 180,
      contactAreaMm2: 500,
      interfaceThicknessUm: 100,
      contactPressureKpa: 5,
      contactConductanceWM2K: 0,
      deviceThicknessMm: 5,
      controllerMaxFluxWM2: 10000,
      baselineSkinTemperatureC: 33,
      ambientTemperatureC: 22,
    },
    options: {
      skinProfileId: "volar-forearm",
      deviceMaterialId: "copper",
      interfaceMaterialId: "hydrogel",
      deviceControl: "ideal",
      damageModelId: "henriques-1947",
    },
  },
];

export function getStimulusDefinition(
  type: StimulusType,
): StimulusDefinition | undefined {
  return BUILTIN_STIMULI.find((s) => s.type === type);
}

export function defaultParametersFor(type: StimulusType): StimulusParameters {
  const definition = getStimulusDefinition(type);
  if (!definition) return {};
  return Object.fromEntries(
    definition.fields
      .filter((field): field is StimulusNumberField => field.kind === "number")
      .map((field) => [field.key, field.defaultValue]),
  );
}

export function defaultOptionsFor(type: StimulusType): StimulusOptions {
  const definition = getStimulusDefinition(type);
  if (!definition) return {};
  return Object.fromEntries(
    definition.fields
      .filter((field): field is StimulusChoiceField => field.kind === "choice")
      .map((field) => [field.key, field.defaultValue]),
  );
}

export function stimulusLabel(type: StimulusType): string {
  return getStimulusDefinition(type)?.label ?? type;
}

/** Fields that apply given the current selections, e.g. hiding device mass for an ideal device. */
export function visibleFields(
  definition: StimulusDefinition,
  parameters: StimulusParameters,
  options: StimulusOptions,
): StimulusField[] {
  const control = options.deviceControl ?? "ideal";
  const conductanceOverridden = (parameters.contactConductanceWM2K ?? 0) > 0;
  const cyclic = (options.loadingMode ?? "static") === "cyclic";

  return definition.fields.filter((field) => {
    switch (field.key) {
      case "deviceThicknessMm":
      case "deviceMaterialId":
        return control !== "ideal";
      case "controllerMaxFluxWM2":
        return control === "regulated";
      case "interfaceMaterialId":
      case "interfaceThicknessUm":
      case "contactPressureKpa":
        return !conductanceOverridden;
      case "cycles":
      case "frequencyHz":
        return cyclic;
      default:
        return true;
    }
  });
}
