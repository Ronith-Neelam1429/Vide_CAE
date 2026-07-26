import type {
  HeatContactResult,
  SimulationResult,
  ValidationSuiteReport,
} from "./simulation";

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

export function exportValidationReport(report: ValidationSuiteReport): void {
  const stamp = new Date(report.generatedAtUnixMs)
    .toISOString()
    .replace(/[:.]/g, "-");

  const metricsHeader = [
    "case_id",
    "split",
    "synthetic",
    "availability",
    "sample_count",
    "rmse_c",
    "mae_c",
    "signed_bias_c",
    "peak_temperature_error_c",
    "time_to_peak_error_s",
    "unavailable_reason",
    "measured_checksum",
  ];
  const metricsRows = report.cases.map((entry) => [
    entry.caseId,
    entry.split,
    entry.synthetic,
    entry.availability,
    entry.metrics.sampleCount,
    entry.metrics.rmseC,
    entry.metrics.maeC,
    entry.metrics.signedBiasC,
    entry.metrics.peakTemperatureErrorC,
    entry.metrics.timeToPeakErrorS,
    entry.metrics.unavailableReason,
    entry.measuredSeriesChecksum,
  ]);
  download(
    toCsv(metricsHeader, metricsRows),
    `vide-validation-metrics-${stamp}.csv`,
    "text/csv",
  );

  const seriesHeader = [
    "case_id",
    "split",
    "time_s",
    "measured_c",
    "predicted_c",
    "residual_c",
  ];
  const seriesRows = report.cases.flatMap((entry) =>
    entry.comparison.map((point) => [
      entry.caseId,
      entry.split,
      point.timeS,
      point.measuredC,
      point.predictedC,
      point.residualC,
    ]),
  );
  download(
    toCsv(seriesHeader, seriesRows),
    `vide-validation-comparison-${stamp}.csv`,
    "text/csv",
  );

  const measuredHeader = ["case_id", "time_s", "temperature_c"];
  const measuredRows = report.cases.flatMap((entry) =>
    entry.measuredSeries.map((sample) => [
      entry.caseId,
      sample.timeS,
      sample.temperatureC,
    ]),
  );
  download(
    toCsv(measuredHeader, measuredRows),
    `vide-validation-measured-${stamp}.csv`,
    "text/csv",
  );

  download(
    JSON.stringify(
      {
        generatedAt: new Date(report.generatedAtUnixMs).toISOString(),
        modelVersion: report.modelVersion,
        calibrated: report.calibrated,
        includeSyntheticFixtures: report.includeSyntheticFixtures,
        lockedParameters: report.lockedParameters,
        disclosure: report.disclosure,
        sourceAudit: report.sourceAudit,
        cases: report.cases.map((entry) => ({
          caseId: entry.caseId,
          title: entry.title,
          split: entry.split,
          synthetic: entry.synthetic,
          availability: entry.availability,
          availabilityNote: entry.availabilityNote,
          citation: entry.citation,
          measurementTarget: entry.measurementTarget,
          protocolComplete: entry.protocolComplete,
          measuredSeriesChecksum: entry.measuredSeriesChecksum,
          lockedParameters: entry.lockedParameters,
          metrics: entry.metrics,
          caveats: entry.caveats,
          peakPredictedSurfaceC: entry.peakPredictedSurfaceC,
          peakMeasuredC: entry.peakMeasuredC,
          predictedSeries: entry.predictedSeries,
          measuredSeries: entry.measuredSeries,
          comparison: entry.comparison,
        })),
      },
      null,
      2,
    ),
    `vide-validation-report-${stamp}.json`,
    "application/json",
  );
}
