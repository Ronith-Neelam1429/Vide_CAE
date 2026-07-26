//! Experimental heat-validation cases and measured-vs-predicted comparisons.
//!
//! This module is deliberately separate from analytic `verification`. It never
//! invents measured curves, never fits hold-out cases, and never emits a
//! pass/fail experimental-validation badge.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::contact::contact_network;
use super::model::{
    damage_model, device_material, interface_material, skin_profile, DEFAULT_DAMAGE_MODEL_ID,
    DEFAULT_DEVICE_MATERIAL_ID, DEFAULT_INTERFACE_MATERIAL_ID, DEFAULT_SKIN_PROFILE_ID,
    MODEL_VERSION,
};
use super::{
    build_case, solve_case, SimulationContact, SolverSettings, ThermalSample,
};

const CASE_PMED: &str = include_str!("../../../benchmarks/heat/cases/pmed-forearm-cheps-10s.json");
const CASE_MAYROVITZ: &str =
    include_str!("../../../benchmarks/heat/cases/mayrovitz-forearm-local-42c.json");
const FIXTURE_CAL: &str =
    include_str!("../../../benchmarks/heat/fixtures/synthetic-calibration.json");
const FIXTURE_HOLDOUT: &str =
    include_str!("../../../benchmarks/heat/fixtures/synthetic-holdout.json");
const FIXTURE_CAL_CSV: &str =
    include_str!("../../../benchmarks/heat/fixtures/synthetic-calibration.csv");
const FIXTURE_HOLDOUT_CSV: &str =
    include_str!("../../../benchmarks/heat/fixtures/synthetic-holdout.csv");

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ValidationSplit {
    Calibration,
    Holdout,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MeasurementTarget {
    SkinSurface,
    ThermodeInterface,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CaseAvailability {
    Ready,
    AwaitingContactSiteSeries,
    ProtocolOnly,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThermodeSpec {
    pub label: String,
    pub diameter_mm: f64,
    pub area_mm2: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtocolSpec {
    pub stimulus_type: String,
    pub parameters: HashMap<String, f64>,
    pub options: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationCaseManifest {
    pub id: String,
    pub split: ValidationSplit,
    pub title: String,
    pub citation: String,
    pub data_doi: Option<String>,
    pub licence: String,
    pub availability: CaseAvailability,
    pub availability_note: String,
    pub synthetic: bool,
    pub site: String,
    pub cohort: String,
    pub probe_location: String,
    pub thermode: ThermodeSpec,
    pub measurement_target: MeasurementTarget,
    pub sampling_interval_s: f64,
    pub protocol: ProtocolSpec,
    pub calibratable_parameters: Vec<String>,
    pub measured_series_path: Option<String>,
    pub unknowns: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeasuredSample {
    pub time_s: f64,
    pub temperature_c: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComparisonPoint {
    pub time_s: f64,
    pub measured_c: f64,
    pub predicted_c: f64,
    pub residual_c: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComparisonMetrics {
    pub sample_count: usize,
    pub time_alignment: &'static str,
    pub rmse_c: Option<f64>,
    pub mae_c: Option<f64>,
    pub signed_bias_c: Option<f64>,
    pub peak_temperature_error_c: Option<f64>,
    pub time_to_peak_error_s: Option<f64>,
    pub unavailable_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LockedParameter {
    pub key: String,
    pub value: f64,
    pub unit: String,
    pub source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationCaseResult {
    pub case_id: String,
    pub title: String,
    pub split: ValidationSplit,
    pub synthetic: bool,
    pub availability: CaseAvailability,
    pub availability_note: String,
    pub citation: String,
    pub measurement_target: MeasurementTarget,
    pub protocol_complete: bool,
    pub measured_series_checksum: Option<String>,
    pub locked_parameters: Vec<LockedParameter>,
    pub predicted_series: Vec<ThermalSample>,
    pub measured_series: Vec<MeasuredSample>,
    pub comparison: Vec<ComparisonPoint>,
    pub metrics: ComparisonMetrics,
    pub caveats: Vec<String>,
    pub peak_predicted_surface_c: f64,
    pub peak_measured_c: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationSuiteReport {
    pub model_version: &'static str,
    pub generated_at_unix_ms: u64,
    pub include_synthetic_fixtures: bool,
    pub calibrated: bool,
    pub locked_parameters: Vec<LockedParameter>,
    pub cases: Vec<ValidationCaseResult>,
    pub disclosure: &'static str,
    pub source_audit: &'static str,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationRequest {
    #[serde(default)]
    pub include_synthetic_fixtures: bool,
    #[serde(default)]
    pub allow_calibration: bool,
    #[serde(default)]
    pub settings: SolverSettings,
}

impl Default for ValidationRequest {
    fn default() -> Self {
        Self {
            include_synthetic_fixtures: false,
            allow_calibration: true,
            settings: SolverSettings {
                surface_cell_um: 5.0,
                max_cell_um: 400.0,
                growth_ratio: 1.12,
                time_step_ms: 20.0,
                run_convergence_check: false,
                run_sensitivity: false,
            },
        }
    }
}

fn parse_manifest(raw: &str) -> Result<ValidationCaseManifest, String> {
    serde_json::from_str(raw).map_err(|error| format!("Invalid validation case JSON: {error}"))
}

/// Parse a two-column CSV (`time_s,temperature_c`). Rejects empty, non-monotonic,
/// or mixed/invalid numeric rows.
pub fn parse_measured_csv(raw: &str) -> Result<Vec<MeasuredSample>, String> {
    let mut samples: Vec<MeasuredSample> = Vec::new();
    let mut saw_header = false;
    for (index, line) in raw.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let parts: Vec<&str> = trimmed.split(',').map(str::trim).collect();
        if parts.len() < 2 {
            return Err(format!("CSV line {}: expected time_s,temperature_c", index + 1));
        }
        if !saw_header
            && parts[0].eq_ignore_ascii_case("time_s")
            && parts[1].to_ascii_lowercase().contains("temperature")
        {
            saw_header = true;
            continue;
        }
        let time_s: f64 = parts[0]
            .parse()
            .map_err(|_| format!("CSV line {}: invalid time_s '{}'", index + 1, parts[0]))?;
        let temperature_c: f64 = parts[1].parse().map_err(|_| {
            format!(
                "CSV line {}: invalid temperature_c '{}'",
                index + 1,
                parts[1]
            )
        })?;
        if !time_s.is_finite() || !temperature_c.is_finite() {
            return Err(format!("CSV line {}: non-finite values", index + 1));
        }
        if let Some(previous) = samples.last() {
            if time_s <= previous.time_s {
                return Err(format!(
                    "CSV line {}: time must be strictly increasing ({} <= {})",
                    index + 1,
                    time_s,
                    previous.time_s
                ));
            }
        }
        samples.push(MeasuredSample {
            time_s,
            temperature_c,
        });
    }
    if samples.is_empty() {
        return Err("Measured CSV contains no samples".into());
    }
    Ok(samples)
}

fn checksum_hex(raw: &str) -> String {
    // Stable content fingerprint for provenance; not a cryptographic claim.
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in raw.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}-{}", raw.len())
}

fn literature_cases() -> Result<Vec<(ValidationCaseManifest, Option<&'static str>)>, String> {
    Ok(vec![
        (parse_manifest(CASE_PMED)?, None),
        (parse_manifest(CASE_MAYROVITZ)?, None),
    ])
}

fn synthetic_cases() -> Result<Vec<(ValidationCaseManifest, Option<&'static str>)>, String> {
    Ok(vec![
        (parse_manifest(FIXTURE_CAL)?, Some(FIXTURE_CAL_CSV)),
        (parse_manifest(FIXTURE_HOLDOUT)?, Some(FIXTURE_HOLDOUT_CSV)),
    ])
}

fn contact_from_protocol(manifest: &ValidationCaseManifest) -> SimulationContact {
    SimulationContact {
        id: manifest.id.clone(),
        label: manifest.title.clone(),
        stimulus_type: manifest.protocol.stimulus_type.clone(),
        parameters: manifest.protocol.parameters.clone(),
        options: manifest.protocol.options.clone(),
    }
}

fn resolve_conductance(
    contact: &SimulationContact,
    override_conductance: Option<f64>,
) -> Result<f64, String> {
    let profile = skin_profile(contact.text("skinProfileId", DEFAULT_SKIN_PROFILE_ID))
        .ok_or_else(|| "Unknown skin profile in validation case".to_string())?;
    let device_mat = device_material(contact.text("deviceMaterialId", DEFAULT_DEVICE_MATERIAL_ID))
        .ok_or_else(|| "Unknown device material in validation case".to_string())?;
    let interface_mat =
        interface_material(contact.text("interfaceMaterialId", DEFAULT_INTERFACE_MATERIAL_ID))
            .ok_or_else(|| "Unknown interface material in validation case".to_string())?;
    let pressure_pa = contact.number_or("contactPressureKpa", 5.0) * 1000.0;
    let interface_thickness_m = contact
        .number_or("interfaceThicknessUm", interface_mat.default_thickness_um)
        .max(0.1)
        * 1e-6;
    let dermis = profile.layers.get(1).unwrap_or(&profile.layers[0]);
    let network = contact_network(
        interface_mat,
        device_mat,
        dermis.conductivity_w_per_m_k.value,
        interface_thickness_m,
        pressure_pa,
        override_conductance.or_else(|| contact.number("contactConductanceWM2K")),
    );
    Ok(network.total_w_per_m2_k)
}

fn predicted_quantity(
    sample: &ThermalSample,
    target: MeasurementTarget,
) -> Result<f64, String> {
    match target {
        MeasurementTarget::SkinSurface => Ok(sample.surface_temperature_c),
        MeasurementTarget::ThermodeInterface => Ok(sample.device_temperature_c),
    }
}

fn interpolate_predicted(
    series: &[ThermalSample],
    time_s: f64,
    target: MeasurementTarget,
) -> Result<f64, String> {
    if series.is_empty() {
        return Err("Predicted series is empty".into());
    }
    if time_s <= series[0].time_s {
        return predicted_quantity(&series[0], target);
    }
    if time_s >= series[series.len() - 1].time_s {
        return predicted_quantity(series.last().unwrap(), target);
    }
    for window in series.windows(2) {
        let left = &window[0];
        let right = &window[1];
        if time_s >= left.time_s && time_s <= right.time_s {
            let span = (right.time_s - left.time_s).max(1e-12);
            let t = (time_s - left.time_s) / span;
            let a = predicted_quantity(left, target)?;
            let b = predicted_quantity(right, target)?;
            return Ok(a + t * (b - a));
        }
    }
    predicted_quantity(series.last().unwrap(), target)
}

pub fn compare_series(
    measured: &[MeasuredSample],
    predicted: &[ThermalSample],
    target: MeasurementTarget,
) -> Result<(Vec<ComparisonPoint>, ComparisonMetrics), String> {
    if measured.is_empty() {
        return Ok((
            Vec::new(),
            ComparisonMetrics {
                sample_count: 0,
                time_alignment: "linear interpolation of predicted onto measured times",
                rmse_c: None,
                mae_c: None,
                signed_bias_c: None,
                peak_temperature_error_c: None,
                time_to_peak_error_s: None,
                unavailable_reason: Some("No measured samples".into()),
            },
        ));
    }

    let mut comparison = Vec::with_capacity(measured.len());
    let mut abs_sum = 0.0;
    let mut sq_sum = 0.0;
    let mut bias_sum = 0.0;

    for sample in measured {
        let predicted_c = interpolate_predicted(predicted, sample.time_s, target)?;
        let residual = predicted_c - sample.temperature_c;
        abs_sum += residual.abs();
        sq_sum += residual * residual;
        bias_sum += residual;
        comparison.push(ComparisonPoint {
            time_s: sample.time_s,
            measured_c: sample.temperature_c,
            predicted_c,
            residual_c: residual,
        });
    }

    let n = comparison.len() as f64;
    let measured_peak = measured
        .iter()
        .max_by(|a, b| a.temperature_c.total_cmp(&b.temperature_c))
        .unwrap();
    let predicted_peak_time = predicted
        .iter()
        .map(|sample| {
            (
                sample.time_s,
                predicted_quantity(sample, target).unwrap_or(f64::NAN),
            )
        })
        .filter(|(_, value)| value.is_finite())
        .max_by(|a, b| a.1.total_cmp(&b.1));

    let peak_temperature_error_c = predicted_peak_time.map(|(_, peak)| peak - measured_peak.temperature_c);
    let time_to_peak_error_s =
        predicted_peak_time.map(|(time, _)| time - measured_peak.time_s);

    Ok((
        comparison,
        ComparisonMetrics {
            sample_count: measured.len(),
            time_alignment: "linear interpolation of predicted onto measured times",
            rmse_c: Some((sq_sum / n).sqrt()),
            mae_c: Some(abs_sum / n),
            signed_bias_c: Some(bias_sum / n),
            peak_temperature_error_c,
            time_to_peak_error_s,
            unavailable_reason: None,
        },
    ))
}

fn unavailable_metrics(reason: impl Into<String>) -> ComparisonMetrics {
    ComparisonMetrics {
        sample_count: 0,
        time_alignment: "linear interpolation of predicted onto measured times",
        rmse_c: None,
        mae_c: None,
        signed_bias_c: None,
        peak_temperature_error_c: None,
        time_to_peak_error_s: None,
        unavailable_reason: Some(reason.into()),
    }
}

fn run_case_prediction(
    manifest: &ValidationCaseManifest,
    settings: &SolverSettings,
    locked_conductance: Option<f64>,
) -> Result<(Vec<ThermalSample>, f64, f64), String> {
    let contact = contact_from_protocol(manifest);
    if contact.stimulus_type != "heat" {
        return Err(format!(
            "Validation case {} is not a heat protocol",
            manifest.id
        ));
    }
    let profile = skin_profile(contact.text("skinProfileId", DEFAULT_SKIN_PROFILE_ID))
        .ok_or_else(|| format!("Unknown skin profile for {}", manifest.id))?;
    let damage = damage_model(contact.text("damageModelId", DEFAULT_DAMAGE_MODEL_ID))
        .ok_or_else(|| format!("Unknown damage model for {}", manifest.id))?;
    let conductance = resolve_conductance(&contact, locked_conductance)?;
    let case = build_case(&contact, profile, damage, conductance);
    let output = solve_case(&case, settings, profile, true);
    Ok((output.series, output.peak_surface_c, conductance))
}

fn calibrate_contact_conductance(
    manifest: &ValidationCaseManifest,
    measured: &[MeasuredSample],
    settings: &SolverSettings,
) -> Result<LockedParameter, String> {
    if manifest.split != ValidationSplit::Calibration {
        return Err("Refusing to calibrate on a hold-out case".into());
    }
    if !manifest
        .calibratable_parameters
        .iter()
        .any(|key| key == "contactConductanceWM2K")
    {
        return Err("Case does not declare contactConductanceWM2K as calibratable".into());
    }

    let candidates = [
        50.0, 80.0, 120.0, 180.0, 250.0, 350.0, 500.0, 750.0, 1000.0, 1500.0, 2000.0,
    ];
    let mut best = None::<(f64, f64)>;
    for conductance in candidates {
        let (predicted, _, _) =
            run_case_prediction(manifest, settings, Some(conductance))?;
        let (_, metrics) =
            compare_series(measured, &predicted, manifest.measurement_target)?;
        let rmse = metrics
            .rmse_c
            .ok_or_else(|| "Calibration comparison produced no RMSE".to_string())?;
        if best.map(|(_, best_rmse)| rmse < best_rmse).unwrap_or(true) {
            best = Some((conductance, rmse));
        }
    }
    let (value, _) = best.ok_or_else(|| "Calibration grid search failed".to_string())?;
    Ok(LockedParameter {
        key: "contactConductanceWM2K".into(),
        value,
        unit: "W/m²K".into(),
        source: format!("calibrated on {}", manifest.id),
    })
}

fn evaluate_case(
    manifest: ValidationCaseManifest,
    measured_csv: Option<&str>,
    settings: &SolverSettings,
    locked: &[LockedParameter],
) -> Result<ValidationCaseResult, String> {
    let mut caveats = manifest.unknowns.clone();
    caveats.push(manifest.availability_note.clone());
    if manifest.synthetic {
        caveats.push(
            "SYNTHETIC FIXTURE — not a published experiment; excluded from experimental claims."
                .into(),
        );
    }

    let locked_conductance = locked
        .iter()
        .find(|parameter| parameter.key == "contactConductanceWM2K")
        .map(|parameter| parameter.value);

    // Hold-out cases must never receive a fresh fit; they may only consume
    // parameters locked on the calibration split.
    if manifest.split == ValidationSplit::Holdout
        && manifest
            .calibratable_parameters
            .iter()
            .any(|key| key == "contactConductanceWM2K")
        && locked_conductance.is_none()
    {
        caveats.push("Hold-out case evaluated with default contact network (no calibration lock applied).".into());
    }

    let (predicted_series, peak_predicted_surface_c, used_conductance) =
        run_case_prediction(&manifest, settings, locked_conductance)?;

    let mut locked_parameters = locked.to_vec();
    if locked_conductance.is_none() {
        locked_parameters.push(LockedParameter {
            key: "contactConductanceWM2K".into(),
            value: used_conductance,
            unit: "W/m²K".into(),
            source: "protocol / contact network (unlocked)".into(),
        });
    }

    let protocol_complete = !manifest.protocol.parameters.is_empty()
        && manifest.protocol.options.contains_key("skinProfileId");

    let ready = manifest.availability == CaseAvailability::Ready && measured_csv.is_some();
    if !ready {
        return Ok(ValidationCaseResult {
            case_id: manifest.id,
            title: manifest.title,
            split: manifest.split,
            synthetic: manifest.synthetic,
            availability: manifest.availability,
            availability_note: manifest.availability_note,
            citation: manifest.citation,
            measurement_target: manifest.measurement_target,
            protocol_complete,
            measured_series_checksum: None,
            locked_parameters,
            predicted_series,
            measured_series: Vec::new(),
            comparison: Vec::new(),
            metrics: unavailable_metrics(
                "Measured contact-site series unavailable; comparison metrics withheld",
            ),
            caveats,
            peak_predicted_surface_c,
            peak_measured_c: None,
        });
    }

    let csv = measured_csv.unwrap();
    let measured_series = parse_measured_csv(csv)?;
    let checksum = checksum_hex(csv);
    let (comparison, metrics) =
        compare_series(&measured_series, &predicted_series, manifest.measurement_target)?;
    let peak_measured_c = measured_series
        .iter()
        .map(|sample| sample.temperature_c)
        .fold(f64::NEG_INFINITY, f64::max);

    Ok(ValidationCaseResult {
        case_id: manifest.id,
        title: manifest.title,
        split: manifest.split,
        synthetic: manifest.synthetic,
        availability: manifest.availability,
        availability_note: manifest.availability_note,
        citation: manifest.citation,
        measurement_target: manifest.measurement_target,
        protocol_complete,
        measured_series_checksum: Some(checksum),
        locked_parameters,
        predicted_series,
        measured_series,
        comparison,
        metrics,
        caveats,
        peak_predicted_surface_c,
        peak_measured_c: Some(peak_measured_c),
    })
}

/// Run the experimental validation suite.
///
/// Calibration (if enabled and a ready calibration case exists) fits only
/// predeclared parameters on the calibration split, then freezes them for
/// hold-out evaluation. Hold-out fitting is rejected.
pub fn run_validation_suite(request: ValidationRequest) -> Result<ValidationSuiteReport, String> {
    let mut settings = request.settings;
    settings.run_convergence_check = false;
    settings.run_sensitivity = false;

    let mut catalog = literature_cases()?;
    if request.include_synthetic_fixtures {
        catalog.extend(synthetic_cases()?);
    }

    let mut locked_parameters = Vec::new();
    let mut calibrated = false;

    if request.allow_calibration {
        if let Some((manifest, csv)) = catalog.iter().find(|(manifest, csv)| {
            manifest.split == ValidationSplit::Calibration
                && manifest.availability == CaseAvailability::Ready
                && csv.is_some()
                && (!manifest.synthetic || request.include_synthetic_fixtures)
        }) {
            if let Some(raw) = csv {
                let measured = parse_measured_csv(raw)?;
                let locked = calibrate_contact_conductance(manifest, &measured, &settings)?;
                locked_parameters.push(locked);
                calibrated = true;
            }
        }
    }

    // Guard: never calibrate using a hold-out case even if mis-tagged later.
    for (manifest, _) in &catalog {
        if manifest.split == ValidationSplit::Holdout
            && manifest
                .calibratable_parameters
                .iter()
                .any(|key| key == "contactConductanceWM2K")
            && request.allow_calibration
            && manifest.availability == CaseAvailability::Ready
        {
            // Explicit no-op with documentation in caveats during evaluate_case.
        }
    }

    let mut cases = Vec::with_capacity(catalog.len());
    for (manifest, csv) in catalog {
        if manifest.split == ValidationSplit::Holdout
            && manifest.calibratable_parameters.contains(&"contactConductanceWM2K".to_string())
            && calibrated
        {
            // Hold-out consumes locked parameters only.
        }
        cases.push(evaluate_case(manifest, csv, &settings, &locked_parameters)?);
    }

    let generated_at_unix_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0);

    Ok(ValidationSuiteReport {
        model_version: MODEL_VERSION,
        generated_at_unix_ms,
        include_synthetic_fixtures: request.include_synthetic_fixtures,
        calibrated,
        locked_parameters,
        cases,
        disclosure: "Comparison only. No experimental pass/fail claim. Anatomical GLB is placement/visualization only; the heat model is 1-D site-profile Pennes bioheat. Literature cases without contact-site measured series report unavailable metrics.",
        source_audit: include_str!("../../../benchmarks/heat/SOURCE_AUDIT.md"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_non_monotonic_csv() {
        let err = parse_measured_csv("time_s,temperature_c\n0,33\n1,34\n0.5,35\n")
            .expect_err("should reject");
        assert!(err.contains("increasing"));
    }

    #[test]
    fn parses_valid_csv() {
        let samples = parse_measured_csv(FIXTURE_CAL_CSV).expect("csv");
        assert!(samples.len() >= 5);
        assert!(samples[1].time_s > samples[0].time_s);
    }

    #[test]
    fn comparison_metrics_are_finite() {
        let measured = parse_measured_csv(FIXTURE_CAL_CSV).unwrap();
        let manifest = parse_manifest(FIXTURE_CAL).unwrap();
        let (predicted, _, _) =
            run_case_prediction(&manifest, &ValidationRequest::default().settings, Some(250.0))
                .unwrap();
        let (_, metrics) =
            compare_series(&measured, &predicted, MeasurementTarget::SkinSurface).unwrap();
        assert!(metrics.rmse_c.unwrap().is_finite());
        assert!(metrics.mae_c.unwrap().is_finite());
        assert!(metrics.unavailable_reason.is_none());
    }

    #[test]
    fn refuses_holdout_calibration() {
        let measured = parse_measured_csv(FIXTURE_HOLDOUT_CSV).unwrap();
        let manifest = parse_manifest(FIXTURE_HOLDOUT).unwrap();
        let err = calibrate_contact_conductance(
            &manifest,
            &measured,
            &ValidationRequest::default().settings,
        )
        .expect_err("holdout fit blocked");
        assert!(err.contains("hold-out") || err.contains("calibratable"));
    }

    #[test]
    fn literature_suite_runs_without_claiming_metrics() {
        let report = run_validation_suite(ValidationRequest {
            include_synthetic_fixtures: false,
            allow_calibration: true,
            ..ValidationRequest::default()
        })
        .expect("suite");
        assert_eq!(report.cases.len(), 2);
        assert!(!report.calibrated);
        for case in &report.cases {
            assert!(!case.synthetic);
            assert!(case.metrics.rmse_c.is_none());
            assert!(case.metrics.unavailable_reason.is_some());
            assert!(!case.predicted_series.is_empty());
        }
    }

    #[test]
    fn synthetic_suite_calibrates_then_evaluates_holdout() {
        let report = run_validation_suite(ValidationRequest {
            include_synthetic_fixtures: true,
            allow_calibration: true,
            ..ValidationRequest::default()
        })
        .expect("suite");
        assert!(report.calibrated);
        assert!(report
            .locked_parameters
            .iter()
            .any(|parameter| parameter.key == "contactConductanceWM2K"));
        let holdout = report
            .cases
            .iter()
            .find(|case| case.case_id == "synthetic-forearm-holdout")
            .expect("holdout");
        assert_eq!(holdout.split, ValidationSplit::Holdout);
        assert!(holdout.metrics.rmse_c.is_some());
        // Ensure the locked value from calibration was applied, not a fresh hold-out fit.
        assert!(holdout
            .locked_parameters
            .iter()
            .any(|parameter| parameter.source.contains("calibrated on")));
    }

    #[test]
    fn literature_manifests_parse() {
        let pmed = parse_manifest(CASE_PMED).unwrap();
        assert_eq!(pmed.split, ValidationSplit::Calibration);
        assert!(!pmed.synthetic);
        let holdout = parse_manifest(CASE_MAYROVITZ).unwrap();
        assert_eq!(holdout.split, ValidationSplit::Holdout);
    }
}
