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
    kind: "choice",
    key: "solverDimension",
    label: "Solver mode",
    defaultValue: "auto",
    group: "contact",
    choices: [
      { value: "auto", label: "Auto — pick 1D or axisymmetric from contact size" },
      { value: "1d", label: "1D fast — depth-only (large pads)" },
      {
        value: "axisymmetric",
        label: "Axisymmetric r–z — resolves lateral heat spread (small probes)",
      },
    ],
    help: "Small contact patches lose heat sideways. Auto switches to axisymmetric r–z when the 1D assumption breaks down (Fo ≥ 0.02).",
  },
  {
    kind: "choice",
    key: "perfusionModel",
    label: "Blood perfusion",
    defaultValue: "local-hyperemia",
    group: "environment",
    choices: [
      {
        value: "local-hyperemia",
        label: "Local hyperemia — blood flow rises with tissue temperature",
      },
      { value: "static", label: "Static — constant baseline perfusion" },
    ],
    help: "Local heating can raise cutaneous blood flow ~9× by 42 °C (Mayrovitz 2020). That removes heat and lowers peak skin temperature during long holds.",
  },
  {
    kind: "number",
    key: "perfusionMaxFold",
    label: "Max perfusion fold",
    unit: "×",
    min: 1,
    max: 20,
    step: 0.1,
    defaultValue: 9,
    group: "environment",
    help: "Peak blood-flow / baseline under local heating. Literature forearm values are typically 8–11× near 42 °C.",
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
  {
    kind: "choice",
    key: "protocolMode",
    label: "Temperature protocol",
    defaultValue: "constant",
    group: "essential",
    choices: [
      { value: "constant", label: "Constant hold" },
      { value: "timeline", label: "Timeline · hold → ramp → release → repeat" },
    ],
  },
  {
    kind: "number",
    key: "timelineHoldS",
    label: "Hold duration",
    unit: "s",
    min: 0,
    max: 3600,
    step: 1,
    defaultValue: 10,
    group: "essential",
  },
  {
    kind: "number",
    key: "timelineRampTargetC",
    label: "Ramp target",
    unit: "°C",
    min: 20,
    max: 150,
    step: 0.1,
    defaultValue: 46,
    group: "essential",
  },
  {
    kind: "number",
    key: "timelineRampS",
    label: "Ramp duration",
    unit: "s",
    min: 0,
    max: 3600,
    step: 1,
    defaultValue: 5,
    group: "essential",
  },
  {
    kind: "number",
    key: "timelineReleaseS",
    label: "Release / cool duration",
    unit: "s",
    min: 0,
    max: 3600,
    step: 1,
    defaultValue: 10,
    group: "essential",
  },
  {
    kind: "number",
    key: "timelineRepeats",
    label: "Repeat count",
    unit: "×",
    min: 1,
    max: 1000,
    step: 1,
    defaultValue: 1,
    group: "essential",
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
    label: "Compression mode",
    defaultValue: "static",
    group: "essential",
    choices: [
      { value: "static", label: "Stable load — hold then release" },
      { value: "cyclic", label: "Cyclic compression — repeated loading" },
    ],
    help: "Choose this first. Stable load evaluates creep, recovery and pressure-time risk; cyclic compression evaluates repeated-load damage.",
  },
  {
    kind: "choice",
    key: "waveformShape",
    label: "Waveform",
    defaultValue: "square",
    group: "essential",
    choices: [
      { value: "square", label: "Square — abrupt load / unload" },
      { value: "sinusoidal", label: "Sinusoidal — smooth oscillation" },
      { value: "trapezoidal", label: "Trapezoidal — ramp, hold, release" },
    ],
    help: "The waveform controls the displayed pressure history. Fatigue uses its equivalent alternating stress amplitude.",
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

const ELECTRICAL_FIELDS: StimulusField[] = [
  {
    kind: "choice",
    key: "waveformType",
    label: "Waveform",
    defaultValue: "pulsed",
    group: "essential",
    choices: [
      { value: "dc", label: "DC — continuous current" },
      { value: "ac", label: "AC — sinusoidal" },
      { value: "pulsed", label: "Pulsed — rectangular pulses" },
    ],
  },
  {
    kind: "choice",
    key: "electricalDriveMode",
    label: "Drive",
    defaultValue: "current",
    group: "essential",
    choices: [
      { value: "current", label: "Current controlled" },
      { value: "voltage", label: "Voltage controlled" },
    ],
  },
  {
    kind: "number",
    key: "currentMa",
    label: "Current amplitude",
    unit: "mA",
    min: 0,
    max: 1000,
    step: 0.1,
    defaultValue: 5,
    group: "essential",
  },
  {
    kind: "number",
    key: "voltageV",
    label: "Voltage amplitude",
    unit: "V",
    min: 0,
    max: 1000,
    step: 0.1,
    defaultValue: 10,
    group: "essential",
  },
  {
    kind: "number",
    key: "pulseDurationUs",
    label: "Pulse duration",
    unit: "µs",
    min: 1,
    max: 1_000_000,
    step: 10,
    defaultValue: 250,
    group: "essential",
  },
  {
    kind: "number",
    key: "frequencyHz",
    label: "Frequency",
    unit: "Hz",
    min: 0.01,
    max: 100_000,
    step: 1,
    defaultValue: 50,
    group: "essential",
  },
  {
    kind: "number",
    key: "durationS",
    label: "Total duration",
    unit: "s",
    min: 0.1,
    max: 3600,
    step: 1,
    defaultValue: 60,
    group: "essential",
  },
  {
    kind: "number",
    key: "contactAreaMm2",
    label: "Electrode contact area",
    unit: "mm²",
    min: 1,
    max: 50_000,
    step: 1,
    defaultValue: 400,
    group: "essential",
  },
  {
    kind: "choice",
    key: "skinProfileId",
    label: "Tissue site",
    defaultValue: "volar-forearm",
    group: "environment",
    catalog: "skinProfiles",
  },
  {
    kind: "number",
    key: "electricalDutyCycle",
    label: "Electrical duty cycle",
    unit: "%",
    min: 0.1,
    max: 100,
    step: 0.1,
    defaultValue: 1.25,
    group: "device",
  },
  {
    kind: "number",
    key: "interfaceImpedanceOhm",
    label: "Gel / interface impedance",
    unit: "Ω",
    min: 0,
    max: 1_000_000,
    step: 10,
    defaultValue: 500,
    group: "contact",
  },
  {
    kind: "number",
    key: "postExposureS",
    label: "Post-stimulation cooling",
    unit: "s",
    min: 0,
    max: 3600,
    step: 1,
    defaultValue: 60,
    group: "environment",
  },
  {
    kind: "choice",
    key: "solverDimension",
    label: "Solver mode",
    defaultValue: "auto",
    group: "contact",
    choices: [
      { value: "auto", label: "Auto" },
      { value: "1d", label: "1D layered" },
      { value: "axisymmetric", label: "Axisymmetric local electrode" },
    ],
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
    description:
      "Layered electrical resistance, Joule heating coupled into Pennes bioheat, and strength-duration nerve activation screening.",
    implemented: true,
    fields: ELECTRICAL_FIELDS,
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
    id: "tens-forearm",
    label: "TENS-style forearm pulse",
    description: "5 mA, 250 µs rectangular pulses at 50 Hz through a 400 mm² gel electrode for one minute.",
    stimulusType: "electrical",
    parameters: {
      currentMa: 5,
      voltageV: 10,
      pulseDurationUs: 250,
      frequencyHz: 50,
      durationS: 60,
      contactAreaMm2: 400,
      electricalDutyCycle: 1.25,
      interfaceImpedanceOhm: 500,
      postExposureS: 60,
    },
    options: {
      waveformType: "pulsed",
      electricalDriveMode: "current",
      skinProfileId: "volar-forearm",
      solverDimension: "auto",
    },
  },
  {
    id: "stable-device-pressure",
    label: "Stable wearable pressure",
    description: "A 12 kPa device contact held on the forearm for two hours with a 10 minute recovery observation.",
    stimulusType: "pressure",
    parameters: {
      appliedPressureKpa: 12,
      contactAreaMm2: 400,
      holdDurationS: 7200,
      recoveryS: 600,
      cycles: 1,
      frequencyHz: 1,
      dutyCycle: 100,
      minimumPressureFraction: 0,
    },
    options: {
      loadingMode: "static",
      waveformShape: "square",
      skinProfileId: "volar-forearm",
    },
  },
  {
    id: "cyclic-compression-screen",
    label: "Cyclic compression screen",
    description: "A 50 kPa sinusoidal compression at 1 Hz for 100,000 cycles.",
    stimulusType: "pressure",
    parameters: {
      appliedPressureKpa: 50,
      contactAreaMm2: 400,
      holdDurationS: 30,
      recoveryS: 30,
      cycles: 100000,
      frequencyHz: 1,
      dutyCycle: 50,
      minimumPressureFraction: 0,
    },
    options: {
      loadingMode: "cyclic",
      waveformShape: "sinusoidal",
      skinProfileId: "cortical-bone",
    },
  },
  {
    id: "wearable-band",
    label: "Wearable device on wrist / forearm",
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
      solverDimension: "auto",
      perfusionModel: "local-hyperemia",
    },
  },
  {
    id: "handheld-enclosure",
    label: "Warm handheld grip (palm)",
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
      solverDimension: "auto",
      perfusionModel: "local-hyperemia",
    },
  },
  {
    id: "therapy-pad",
    label: "Hot pack / therapy pad on upper back",
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
      solverDimension: "auto",
      perfusionModel: "local-hyperemia",
    },
  },
  {
    id: "hot-surface-touch",
    label: "Iron / hot-surface contact (fingertip)",
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
      solverDimension: "auto",
      perfusionModel: "local-hyperemia",
    },
  },
  {
    id: "threshold-probe",
    label: "Hot pack on forearm (threshold probe)",
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
      solverDimension: "auto",
      perfusionModel: "local-hyperemia",
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
  const electricalDrive = options.electricalDriveMode ?? "current";
  const electricalWaveform = options.waveformType ?? "pulsed";
  const timeline = (options.protocolMode ?? "constant") === "timeline";

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
      case "dutyCycle":
      case "minimumPressureFraction":
      case "waveformShape":
        return cyclic;
      case "holdDurationS":
        return !cyclic;
      case "durationS":
        return !timeline || definition.type !== "heat";
      case "timelineHoldS":
      case "timelineRampTargetC":
      case "timelineRampS":
      case "timelineReleaseS":
      case "timelineRepeats":
        return definition.type === "heat" && timeline;
      case "currentMa":
        return electricalDrive === "current";
      case "voltageV":
        return electricalDrive === "voltage";
      case "pulseDurationUs":
        return electricalWaveform === "pulsed";
      case "electricalDutyCycle":
        return electricalWaveform !== "dc";
      default:
        return true;
    }
  });
}
