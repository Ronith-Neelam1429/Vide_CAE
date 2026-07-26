//! Temporary blind proof-lab: simulate from protocol inputs only, compare afterward.
//!
//! Ground-truth CSVs are compiled into this module for comparison **only**.
//! They are never passed to `build_case` or `solve_case`.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::model::MODEL_VERSION;
use super::validation::{
    compare_series, parse_measured_csv, ComparisonMetrics, ComparisonPoint, MeasuredSample,
    MeasurementTarget, ProtocolSpec,
};
use super::{build_case, resolve_solver_dimension, solve_heat_case, SimulationContact, SolverSettings, ThermalSample};

const WANG_EPOS_PROTOCOL: &str =
    include_str!("../../../benchmarks/proof-lab/wang-epos-2019-subject070/protocol.json");
const WANG_EPOS_GROUND_TRUTH: &str =
    include_str!("../../../benchmarks/proof-lab/wang-epos-2019-subject070/ground-truth.csv");
const MAYROVITZ_PROTOCOL: &str =
    include_str!("../../../benchmarks/proof-lab/mayrovitz-2020-forearm-42c/protocol.json");
const MAYROVITZ_GROUND_TRUTH: &str =
    include_str!("../../../benchmarks/proof-lab/mayrovitz-2020-forearm-42c/ground-truth.csv");
const PETROFSKY_PROTOCOL: &str =
    include_str!("../../../benchmarks/proof-lab/petrofsky-2011-quad-44c/protocol.json");
const PETROFSKY_GROUND_TRUTH: &str =
    include_str!("../../../benchmarks/proof-lab/petrofsky-2011-quad-44c/ground-truth.csv");

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComparisonWindowSpec {
    pub label: String,
    pub start_s: f64,
    pub end_s: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProofLabCaseManifest {
    pub id: String,
    pub title: String,
    pub citation: String,
    pub measurement_target: MeasurementTarget,
    pub measurement_note: String,
    pub comparison_windows: Vec<ComparisonWindowSpec>,
    pub protocol: ProtocolSpec,
    pub extracted_from_paper: Vec<String>,
    pub unknowns: Vec<String>,
}

fn contact_from_protocol(manifest: &ProofLabCaseManifest) -> SimulationContact {
    SimulationContact {
        id: manifest.id.clone(),
        label: manifest.title.clone(),
        stimulus_type: manifest.protocol.stimulus_type.clone(),
        parameters: manifest.protocol.parameters.clone(),
        options: manifest.protocol.options.clone(),
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowComparison {
    pub label: String,
    pub start_s: f64,
    pub end_s: f64,
    pub sample_count: usize,
    pub metrics: ComparisonMetrics,
    pub comparison: Vec<ComparisonPoint>,
    pub peak_measured_c: Option<f64>,
    pub peak_predicted_c: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProofLabCaseResult {
    pub case_id: String,
    pub title: String,
    pub citation: String,
    pub measurement_target: MeasurementTarget,
    pub measurement_note: String,
    pub protocol_inputs: HashMap<String, f64>,
    pub protocol_options: HashMap<String, String>,
    pub blind_prediction: bool,
    pub predicted_series: Vec<ThermalSample>,
    pub measured_series: Vec<MeasuredSample>,
    pub windows: Vec<WindowComparison>,
    pub extracted_from_paper: Vec<String>,
    pub unknowns: Vec<String>,
    pub caveats: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProofLabReport {
    pub model_version: &'static str,
    pub generated_at_unix_ms: u64,
    pub disclosure: &'static str,
    pub cases: Vec<ProofLabCaseResult>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProofLabRequest {
    #[serde(default)]
    pub settings: SolverSettings,
}

impl Default for ProofLabRequest {
    fn default() -> Self {
        Self {
            settings: SolverSettings {
                surface_cell_um: 5.0,
                max_cell_um: 400.0,
                growth_ratio: 1.12,
                time_step_ms: 50.0,
                run_convergence_check: false,
                run_sensitivity: false,
            },
        }
    }
}

struct ProofLabCaseBundle {
    manifest: ProofLabCaseManifest,
    ground_truth_csv: &'static str,
}

fn proof_lab_cases() -> Result<Vec<ProofLabCaseBundle>, String> {
    Ok(vec![
        ProofLabCaseBundle {
            manifest: serde_json::from_str(MAYROVITZ_PROTOCOL)
                .map_err(|error| format!("Invalid Mayrovitz protocol JSON: {error}"))?,
            ground_truth_csv: MAYROVITZ_GROUND_TRUTH,
        },
        ProofLabCaseBundle {
            manifest: serde_json::from_str(PETROFSKY_PROTOCOL)
                .map_err(|error| format!("Invalid Petrofsky protocol JSON: {error}"))?,
            ground_truth_csv: PETROFSKY_GROUND_TRUTH,
        },
        ProofLabCaseBundle {
            manifest: serde_json::from_str(WANG_EPOS_PROTOCOL)
                .map_err(|error| format!("Invalid Wang EPOS protocol JSON: {error}"))?,
            ground_truth_csv: WANG_EPOS_GROUND_TRUTH,
        },
    ])
}

/// Run the solver from protocol inputs only. Ground truth is not consulted.
fn run_blind_prediction(
    manifest: &ProofLabCaseManifest,
    settings: &SolverSettings,
) -> Result<Vec<ThermalSample>, String> {
    let contact = contact_from_protocol(manifest);
    if contact.stimulus_type != "heat" {
        return Err(format!("Proof-lab case {} is not heat.", manifest.id));
    }
    let profile = super::model::skin_profile(
        contact.text("skinProfileId", super::model::DEFAULT_SKIN_PROFILE_ID),
    )
    .ok_or_else(|| format!("Unknown skin profile for {}", manifest.id))?;
    let damage = super::model::damage_model(
        contact.text("damageModelId", super::model::DEFAULT_DAMAGE_MODEL_ID),
    )
    .ok_or_else(|| format!("Unknown damage model for {}", manifest.id))?;
    let conductance = super::validation::resolve_conductance(&contact, None)?;
    let case = build_case(&contact, profile, damage, conductance);
    let contact_area_m2 = contact.number_or("contactAreaMm2", 25.0) * 1e-6;
    let dermis = profile.layers.get(1).unwrap_or(&profile.layers[0]);
    let diffusivity = dermis.conductivity_w_per_m_k.value
        / (dermis.density_kg_per_m3.value * dermis.specific_heat_j_per_kg_k.value);
    let dimensionality = super::contact::check_dimensionality(
        contact_area_m2,
        diffusivity,
        case.pre_exposure_s + case.exposure_s + case.post_exposure_s,
        case.basal_depth_m,
    );
    let dimension = super::resolve_solver_dimension(
        contact.text("solverDimension", "auto"),
        &dimensionality,
    );
    let output = super::solve_heat_case(
        &case,
        settings,
        profile,
        contact_area_m2,
        dimension,
        true,
    );
    Ok(output.series)
}

fn filter_measured_window(
    measured: &[MeasuredSample],
    start_s: f64,
    end_s: f64,
) -> Vec<MeasuredSample> {
    measured
        .iter()
        .filter(|sample| sample.time_s >= start_s && sample.time_s <= end_s)
        .cloned()
        .collect()
}

fn peak_predicted(series: &[ThermalSample], target: MeasurementTarget) -> Option<f64> {
    series
        .iter()
        .filter_map(|sample| match target {
            MeasurementTarget::SkinSurface => Some(sample.surface_temperature_c),
            MeasurementTarget::ThermodeInterface => Some(sample.device_temperature_c),
        })
        .max_by(f64::total_cmp)
}

fn evaluate_window(
    label: &str,
    start_s: f64,
    end_s: f64,
    measured: &[MeasuredSample],
    predicted: &[ThermalSample],
    target: MeasurementTarget,
) -> Result<WindowComparison, String> {
    let window_measured = filter_measured_window(measured, start_s, end_s);
    let (comparison, metrics) = compare_series(&window_measured, predicted, target)?;
    let peak_measured_c = window_measured
        .iter()
        .map(|sample| sample.temperature_c)
        .max_by(f64::total_cmp);
    Ok(WindowComparison {
        label: label.to_string(),
        start_s,
        end_s,
        sample_count: window_measured.len(),
        metrics,
        comparison,
        peak_measured_c,
        peak_predicted_c: peak_predicted(predicted, target),
    })
}

fn evaluate_case(
    bundle: ProofLabCaseBundle,
    settings: &SolverSettings,
) -> Result<ProofLabCaseResult, String> {
    let ProofLabCaseBundle {
        manifest,
        ground_truth_csv,
    } = bundle;

    // Blind step: prediction uses protocol manifest only.
    let predicted_series = run_blind_prediction(&manifest, settings)?;

    // Comparison step: ground truth is loaded only after simulation completes.
    let measured_series = parse_measured_csv(ground_truth_csv)?;

    let mut windows = Vec::with_capacity(manifest.comparison_windows.len());
    for window in &manifest.comparison_windows {
        windows.push(evaluate_window(
            &window.label,
            window.start_s,
            window.end_s,
            &measured_series,
            &predicted_series,
            manifest.measurement_target,
        )?);
    }

    let mut caveats = manifest.unknowns.clone();
    caveats.push(manifest.measurement_note.clone());
    caveats.push(
        "Blind protocol: measured CSV was not available to the solver; metrics are post-hoc only."
            .into(),
    );

    Ok(ProofLabCaseResult {
        case_id: manifest.id.clone(),
        title: manifest.title.clone(),
        citation: manifest.citation.clone(),
        measurement_target: manifest.measurement_target,
        measurement_note: manifest.measurement_note.clone(),
        protocol_inputs: manifest.protocol.parameters.clone(),
        protocol_options: manifest.protocol.options.clone(),
        blind_prediction: true,
        predicted_series,
        measured_series,
        windows,
        extracted_from_paper: manifest.extracted_from_paper.clone(),
        unknowns: manifest.unknowns.clone(),
        caveats,
    })
}

pub fn run_proof_lab(request: ProofLabRequest) -> Result<ProofLabReport, String> {
    let mut settings = request.settings;
    settings.run_convergence_check = false;
    settings.run_sensitivity = false;

    let cases = proof_lab_cases()?
        .into_iter()
        .map(|bundle| evaluate_case(bundle, &settings))
        .collect::<Result<Vec<_>, _>>()?;

    let generated_at_unix_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0);

    Ok(ProofLabReport {
        model_version: MODEL_VERSION,
        generated_at_unix_ms,
        disclosure: "Blind proof-lab comparison only. The solver saw protocol inputs only; measured series were compared afterward. No experimental pass/fail claim.",
        cases,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blind_prediction_does_not_require_ground_truth_at_compile_boundary() {
        let manifest: ProofLabCaseManifest = serde_json::from_str(WANG_EPOS_PROTOCOL).unwrap();
        let predicted = run_blind_prediction(&manifest, &ProofLabRequest::default().settings)
            .expect("prediction");
        assert!(!predicted.is_empty());
    }

    #[test]
    fn proof_lab_runs_skin_and_interface_cases() {
        let report = run_proof_lab(ProofLabRequest::default()).expect("report");
        assert_eq!(report.cases.len(), 3);

        let mayrovitz = report
            .cases
            .iter()
            .find(|case| case.case_id.contains("mayrovitz"))
            .expect("mayrovitz");
        assert_eq!(mayrovitz.measurement_target, MeasurementTarget::SkinSurface);
        let mayrovitz_rmse = mayrovitz.windows[0].metrics.rmse_c.expect("rmse");
        assert!(
            mayrovitz_rmse < 0.5,
            "Mayrovitz skin RMSE {mayrovitz_rmse:.3} °C too large"
        );

        let petrofsky = report
            .cases
            .iter()
            .find(|case| case.case_id.contains("petrofsky"))
            .expect("petrofsky");
        assert_eq!(petrofsky.measurement_target, MeasurementTarget::SkinSurface);
        let petro_rmse = petrofsky.windows[0].metrics.rmse_c.expect("rmse");
        assert!(
            petro_rmse < 0.5,
            "Petrofsky skin RMSE {petro_rmse:.3} °C too large"
        );

        let interface = report
            .cases
            .iter()
            .find(|case| case.case_id.contains("wang-epos"))
            .expect("interface case");
        let hold = interface
            .windows
            .iter()
            .find(|window| window.label.contains("heating hold"))
            .expect("hold window");
        assert!(hold.metrics.rmse_c.expect("hold rmse") < 1.0);
    }
}
