import type { HeatContactResult, SimulationResult } from "./simulation";

function escapeCsv(value: string | number | boolean | null | undefined): string {
  const raw = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function toCsv(header: string[], rows: Array<Array<string | number | boolean | null>>) {
  return [header.join(","), ...rows.map((row) => row.map(escapeCsv).join(","))].join("\n");
}

function download(contents: string, filename: string, mime: string) {
  const blob = new Blob([contents], { type: `${mime};charset=utf-8` });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}

function runStamp(result: SimulationResult): string {
  return new Date(result.manifest.generatedAtUnixMs)
    .toISOString()
    .replace(/[:.]/g, "-");
}

/**
 * Provenance repeated on every row so a single exported file can still be
 * traced back to the exact model and inputs that produced it.
 */
function provenanceColumns(result: SimulationResult, contact: HeatContactResult) {
  return [
    result.model.version,
    new Date(result.manifest.generatedAtUnixMs).toISOString(),
    contact.skinProfile.id,
    contact.interfaceMaterial.id,
    contact.deviceMaterial.id,
    contact.damageModel.id,
    contact.inputs.deviceControl,
    contact.inputs.deviceSetpointC,
    contact.inputs.contactAreaMm2,
    contact.inputs.contactConductanceWPerM2K,
  ];
}

const PROVENANCE_HEADER = [
  "model_version",
  "run_timestamp_iso",
  "skin_profile_id",
  "interface_material_id",
  "device_material_id",
  "damage_model_id",
  "device_control",
  "device_setpoint_c",
  "contact_area_mm2",
  "contact_conductance_w_per_m2_k",
];

export function exportTimeSeriesCsv(result: SimulationResult): void {
  const header = [
    "contact_id",
    "contact_label",
    "phase",
    "time_s",
    "surface_temperature_c",
    "basal_temperature_c",
    "dermal_base_temperature_c",
    "device_temperature_c",
    "surface_flux_w_per_m2",
    "damage_omega_basal",
    ...PROVENANCE_HEADER,
  ];

  const rows = result.contacts.flatMap((contact) =>
    contact.series.map((sample) => [
      contact.contactPointId,
      contact.label,
      sample.phase,
      sample.timeS,
      sample.surfaceTemperatureC,
      sample.basalTemperatureC,
      sample.dermalBaseTemperatureC,
      sample.deviceTemperatureC,
      sample.surfaceFluxWPerM2,
      sample.damageOmega,
      ...provenanceColumns(result, contact),
    ]),
  );

  download(
    toCsv(header, rows),
    `vide-heat-timeseries-${runStamp(result)}.csv`,
    "text/csv",
  );
}

export function exportDepthProfileCsv(result: SimulationResult): void {
  const header = [
    "contact_id",
    "contact_label",
    "layer",
    "depth_mm",
    "peak_temperature_c",
    "final_temperature_c",
    "damage_omega",
    ...PROVENANCE_HEADER,
  ];

  const rows = result.contacts.flatMap((contact) =>
    contact.depthProfile.map((sample) => [
      contact.contactPointId,
      contact.label,
      sample.layer,
      sample.depthMm,
      sample.peakTemperatureC,
      sample.finalTemperatureC,
      sample.damageOmega,
      ...provenanceColumns(result, contact),
    ]),
  );

  download(
    toCsv(header, rows),
    `vide-heat-depth-profile-${runStamp(result)}.csv`,
    "text/csv",
  );
}

/**
 * The full run record: every resolved input, the tissue properties with their
 * sources, solver settings, convergence and verification evidence, uncertainty
 * bounds and warnings.
 */
export function exportRunManifest(result: SimulationResult): void {
  const manifest = {
    generatedAt: new Date(result.manifest.generatedAtUnixMs).toISOString(),
    model: result.model,
    verification: result.manifest.verification,
    contacts: result.contacts.map((contact) => ({
      contactPointId: contact.contactPointId,
      label: contact.label,
      inputs: contact.inputs,
      contactNetwork: contact.contact,
      dimensionality: contact.dimensionality,
      summary: contact.summary,
      energyBalance: contact.energy,
      bounds: contact.bounds,
      sensitivity: contact.sensitivity,
      convergence: contact.convergence,
      solver: contact.solver,
      warnings: contact.warnings,
      provenance: {
        skinProfile: contact.skinProfile,
        deviceMaterial: contact.deviceMaterial,
        interfaceMaterial: contact.interfaceMaterial,
        damageModel: contact.damageModel,
      },
    })),
    unsupportedContacts: result.unsupportedContacts,
  };

  download(
    JSON.stringify(manifest, null, 2),
    `vide-heat-manifest-${runStamp(result)}.json`,
    "application/json",
  );
}

/** Export everything needed to audit or reproduce the run. */
export function exportSimulationBundle(result: SimulationResult): void {
  exportTimeSeriesCsv(result);
  exportDepthProfileCsv(result);
  exportRunManifest(result);
}
