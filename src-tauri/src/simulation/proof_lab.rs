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
use super::{build_case, SimulationContact, SolverSettings, ThermalSample};

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
const MECHANICAL_GROUND_TRUTH: &str =
    include_str!("../../../benchmarks/proof-lab/linares-reswick-rogers-2012/ground-truth.csv");
const ELECTRICAL_GROUND_TRUTH: &str =
    include_str!("../../../benchmarks/proof-lab/hugosdottir-2019-patch-electrode/ground-truth.csv");

const CHART_POINT_CAP: usize = 240;
const KEY_POINT_CAP: usize = 48;

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

pub(crate) fn contact_from_protocol(manifest: &ProofLabCaseManifest) -> SimulationContact {
    SimulationContact {
        id: manifest.id.clone(),
        label: manifest.title.clone(),
        stimulus_type: manifest.protocol.stimulus_type.clone(),
        parameters: manifest.protocol.parameters.clone(),
        options: manifest.protocol.options.clone(),
    }
}

/// One experiment-relevant quantity compared paper ↔ Vide.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExperimentMetric {
    pub id: String,
    pub label: String,
    pub unit: String,
    pub paper_value: Option<f64>,
    pub vide_value: Option<f64>,
    pub absolute_error: Option<f64>,
    pub relative_error_pct: Option<f64>,
    /// `checkpoint` | `derived` | `summary` | `parameter`
    pub category: &'static str,
    pub description: Option<String>,
    pub note: Option<String>,
}

/// Direct paper ↔ Vide observation used in point tables.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataPointCompare {
    pub label: String,
    pub x: f64,
    pub x_label: String,
    pub x_unit: String,
    pub paper_value: f64,
    pub vide_value: f64,
    pub absolute_error: f64,
    pub relative_error_pct: Option<f64>,
    pub unit: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowComparison {
    pub label: String,
    pub start_s: f64,
    pub end_s: f64,
    pub sample_count: usize,
    pub metrics: ComparisonMetrics,
    /// Downsampled overlay series for charts (full series used for metrics).
    pub comparison: Vec<ComparisonPoint>,
    /// Sparse experiment checkpoints / residual extremes for side-by-side tables.
    pub key_data_points: Vec<DataPointCompare>,
    pub experiment_metrics: Vec<ExperimentMetric>,
    pub peak_measured_c: Option<f64>,
    pub peak_predicted_c: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProofLabCaseResult {
    pub case_id: String,
    pub title: String,
    pub citation: String,
    pub modality: &'static str,
    pub measurement_target: MeasurementTarget,
    pub measurement_note: String,
    pub contact_label: String,
    pub protocol_inputs: HashMap<String, f64>,
    pub protocol_options: HashMap<String, String>,
    pub paper_reference_inputs: HashMap<String, f64>,
    pub paper_reference_options: HashMap<String, String>,
    pub uses_user_contact: bool,
    pub predicted_series: Vec<ThermalSample>,
    pub measured_series: Vec<MeasuredSample>,
    pub windows: Vec<WindowComparison>,
    pub experiment_metrics: Vec<ExperimentMetric>,
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
    pub selected_case_ids: Vec<String>,
    pub cases: Vec<ProofLabCaseResult>,
    pub cross_validation_cases: Vec<CrossValidationCase>,
}

/// Catalog entry for the Proof Lab research library UI.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProofLabLibraryEntry {
    pub case_id: String,
    pub title: String,
    pub citation: String,
    pub modality: &'static str,
    pub measurement_target: Option<MeasurementTarget>,
    pub measurement_summary: String,
    pub site: String,
    pub setpoint_c: Option<f64>,
    pub duration_s: Option<f64>,
    pub status: &'static str,
    pub requires_heat_contact: bool,
    pub highlights: Vec<String>,
    pub unknowns: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CrossValidationPoint {
    pub x: f64,
    pub measured: f64,
    pub predicted: f64,
    pub absolute_error: f64,
    pub relative_error_pct: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CrossValidationCase {
    pub case_id: &'static str,
    pub modality: &'static str,
    pub title: &'static str,
    pub citation: &'static str,
    pub status: &'static str,
    pub x_label: &'static str,
    pub x_unit: &'static str,
    pub metric_label: &'static str,
    pub metric_unit: &'static str,
    pub rmse: f64,
    pub mae: f64,
    pub signed_bias: f64,
    pub points: Vec<CrossValidationPoint>,
    pub key_data_points: Vec<DataPointCompare>,
    pub experiment_metrics: Vec<ExperimentMetric>,
    pub caveats: Vec<&'static str>,
}

fn relative_error_pct(paper: f64, vide: f64) -> Option<f64> {
    if !paper.is_finite() || paper.abs() < 1.0e-12 {
        return None;
    }
    Some(((vide - paper) / paper.abs()) * 100.0)
}

fn metric_pair(
    id: impl Into<String>,
    label: impl Into<String>,
    unit: impl Into<String>,
    paper: Option<f64>,
    vide: Option<f64>,
    category: &'static str,
    description: Option<String>,
    note: Option<String>,
) -> ExperimentMetric {
    let absolute_error = match (paper, vide) {
        (Some(p), Some(v)) if p.is_finite() && v.is_finite() => Some(v - p),
        _ => None,
    };
    let relative_error_pct = match (paper, vide) {
        (Some(p), Some(v)) => relative_error_pct(p, v),
        _ => None,
    };
    ExperimentMetric {
        id: id.into(),
        label: label.into(),
        unit: unit.into(),
        paper_value: paper,
        vide_value: vide,
        absolute_error,
        relative_error_pct,
        category,
        description,
        note,
    }
}

fn cross_metrics(points: &[CrossValidationPoint]) -> (f64, f64, f64) {
    let count = points.len().max(1) as f64;
    let errors: Vec<f64> = points
        .iter()
        .map(|point| point.predicted - point.measured)
        .collect();
    let rmse = (errors.iter().map(|error| error * error).sum::<f64>() / count).sqrt();
    let mae = errors.iter().map(|error| error.abs()).sum::<f64>() / count;
    let signed_bias = errors.iter().sum::<f64>() / count;
    (rmse, mae, signed_bias)
}

fn parse_scalar_ground_truth(csv: &str) -> Vec<(f64, f64)> {
    csv.lines()
        .skip(1)
        .filter_map(|line| {
            let mut columns = line.split(',');
            Some((
                columns.next()?.trim().parse().ok()?,
                columns.next()?.trim().parse().ok()?,
            ))
        })
        .collect()
}

fn downsample_comparison(points: &[ComparisonPoint], cap: usize) -> Vec<ComparisonPoint> {
    if points.len() <= cap {
        return points.to_vec();
    }
    let last = points.len() - 1;
    let mut out = Vec::with_capacity(cap);
    for i in 0..cap {
        let index = if i == cap - 1 {
            last
        } else {
            (i * last) / (cap - 1)
        };
        out.push(points[index].clone());
    }
    out
}

fn key_heat_points(points: &[ComparisonPoint], unit: &str, x_unit: &str) -> Vec<DataPointCompare> {
    if points.is_empty() {
        return Vec::new();
    }
    if points.len() <= KEY_POINT_CAP {
        return points
            .iter()
            .map(|point| DataPointCompare {
                label: format!("t = {:.1} {}", point.time_s, x_unit),
                x: point.time_s,
                x_label: "Time".into(),
                x_unit: x_unit.into(),
                paper_value: point.measured_c,
                vide_value: point.predicted_c,
                absolute_error: point.residual_c,
                relative_error_pct: relative_error_pct(point.measured_c, point.predicted_c),
                unit: unit.into(),
            })
            .collect();
    }

    let mut indices = vec![0usize, points.len() - 1];
    let peak_m = points
        .iter()
        .enumerate()
        .max_by(|a, b| a.1.measured_c.total_cmp(&b.1.measured_c))
        .map(|(i, _)| i);
    let peak_p = points
        .iter()
        .enumerate()
        .max_by(|a, b| a.1.predicted_c.total_cmp(&b.1.predicted_c))
        .map(|(i, _)| i);
    let max_abs = points
        .iter()
        .enumerate()
        .max_by(|a, b| a.1.residual_c.abs().total_cmp(&b.1.residual_c.abs()))
        .map(|(i, _)| i);
    for index in [peak_m, peak_p, max_abs].into_iter().flatten() {
        indices.push(index);
    }
    // Evenly spaced anchors so dense series still show experiment structure.
    for i in 0..12 {
        indices.push((i * (points.len() - 1)) / 11);
    }
    indices.sort_unstable();
    indices.dedup();

    indices
        .into_iter()
        .map(|index| {
            let point = &points[index];
            let tag = if Some(index) == peak_m {
                "paper peak"
            } else if Some(index) == peak_p {
                "Vide peak"
            } else if Some(index) == max_abs {
                "largest residual"
            } else if index == 0 {
                "start"
            } else if index + 1 == points.len() {
                "end"
            } else {
                "sample"
            };
            DataPointCompare {
                label: format!("{tag} · t = {:.1} s", point.time_s),
                x: point.time_s,
                x_label: "Time".into(),
                x_unit: x_unit.into(),
                paper_value: point.measured_c,
                vide_value: point.predicted_c,
                absolute_error: point.residual_c,
                relative_error_pct: relative_error_pct(point.measured_c, point.predicted_c),
                unit: unit.into(),
            }
        })
        .collect()
}

fn heat_window_experiment_metrics(
    comparison: &[ComparisonPoint],
    metrics: &ComparisonMetrics,
    peak_measured_c: Option<f64>,
    peak_predicted_c: Option<f64>,
) -> Vec<ExperimentMetric> {
    let mut out = Vec::new();

    if let (Some(first), Some(last)) = (comparison.first(), comparison.last()) {
        out.push(metric_pair(
            "baseline_temperature",
            "Baseline temperature",
            "°C",
            Some(first.measured_c),
            Some(first.predicted_c),
            "checkpoint",
            Some(
                "Temperature at the first published time in this window — usually pre-heat or session start."
                    .into(),
            ),
            Some(format!("At t = {:.1} s", first.time_s)),
        ));
        out.push(metric_pair(
            "end_temperature",
            "End-of-window temperature",
            "°C",
            Some(last.measured_c),
            Some(last.predicted_c),
            "checkpoint",
            Some(
                "Temperature at the last published checkpoint in this window (e.g. after heater removal)."
                    .into(),
            ),
            Some(format!("At t = {:.1} s", last.time_s)),
        ));

        let dt = (last.time_s - first.time_s).max(1.0e-9);
        let paper_rise = last.measured_c - first.measured_c;
        let vide_rise = last.predicted_c - first.predicted_c;
        out.push(metric_pair(
            "temperature_rise",
            "Temperature rise (ΔT)",
            "°C",
            Some(paper_rise),
            Some(vide_rise),
            "derived",
            Some("Total warming from the first to the last checkpoint.".into()),
            None,
        ));
        out.push(metric_pair(
            "mean_rise_rate",
            "Mean rise rate",
            "°C/min",
            Some(paper_rise / (dt / 60.0)),
            Some(vide_rise / (dt / 60.0)),
            "derived",
            Some("Average warming speed across the window.".into()),
            None,
        ));
    }

    out.push(metric_pair(
        "peak_temperature",
        "Peak temperature",
        "°C",
        peak_measured_c,
        peak_predicted_c,
        "derived",
        Some("Highest temperature in the window — study peak vs your simulation.".into()),
        None,
    ));

    if let (Some(peak_m), Some(peak_p)) = (peak_measured_c, peak_predicted_c) {
        out.push(metric_pair(
            "peak_temperature_error",
            "Peak temperature gap",
            "°C",
            Some(peak_m),
            Some(peak_p),
            "derived",
            Some("Difference between simulated peak and study peak (Vide − paper).".into()),
            Some(format!("Gap: {:+.3} °C", peak_p - peak_m)),
        ));
    } else if let Some(err) = metrics.peak_temperature_error_c {
        out.push(metric_pair(
            "peak_temperature_error",
            "Peak temperature gap",
            "°C",
            None,
            Some(err),
            "derived",
            Some("Simulated peak minus study peak.".into()),
            None,
        ));
    }

    out.push(metric_pair(
        "sample_count",
        "Aligned data points",
        "samples",
        Some(comparison.len() as f64),
        Some(comparison.len() as f64),
        "checkpoint",
        Some("Number of published time points compared in this window.".into()),
        None,
    ));

    if let Some(rmse) = metrics.rmse_c {
        out.push(metric_pair(
            "rmse",
            "RMSE (typical gap)",
            "°C",
            None,
            Some(rmse),
            "summary",
            Some(
                "Root mean square error across all aligned time points. Lower means a closer overall fit."
                    .into(),
            ),
            None,
        ));
    }
    if let Some(mae) = metrics.mae_c {
        out.push(metric_pair(
            "mae",
            "MAE (average mismatch)",
            "°C",
            None,
            Some(mae),
            "summary",
            Some("Mean absolute error — average size of mismatch, ignoring direction.".into()),
            None,
        ));
    }
    if let Some(bias) = metrics.signed_bias_c {
        out.push(metric_pair(
            "signed_bias",
            "Signed bias (you − study)",
            "°C",
            None,
            Some(bias),
            "summary",
            Some("Positive means your simulation runs hotter than the study on average.".into()),
            None,
        ));
    }
    if let Some(ttp) = metrics.time_to_peak_error_s {
        out.push(metric_pair(
            "time_to_peak_error",
            "Time-to-peak error",
            "s",
            None,
            Some(ttp),
            "summary",
            Some("Positive means your simulated peak occurs later than the study record.".into()),
            None,
        ));
    }

    out
}

fn case_level_heat_metrics(
    manifest: &ProofLabCaseManifest,
    user_contact: &SimulationContact,
) -> Vec<ExperimentMetric> {
    let mut out = Vec::new();
    let paper_temp = manifest.protocol.parameters.get("temperatureC").copied();
    let user_temp = user_contact.number("temperatureC");
    out.push(metric_pair(
        "paper_setpoint",
        "Heater setpoint",
        "°C",
        paper_temp,
        user_temp,
        "parameter",
        Some("What the study used vs the temperature in your sidebar contact.".into()),
        None,
    ));
    let paper_duration = manifest.protocol.parameters.get("durationS").copied();
    let user_duration = user_contact.number("durationS");
    out.push(metric_pair(
        "paper_duration",
        "Heating duration",
        "s",
        paper_duration,
        user_duration,
        "parameter",
        Some("How long heat was applied in the study vs your sidebar duration.".into()),
        None,
    ));
    out
}

fn mechanical_cross_validation() -> CrossValidationCase {
    // Independent human Reswick-Rogers curve reconstruction from Linares et
    // al. The production screen uses the Linder-Ganz sigmoid coefficients and
    // does not receive these exponential coefficients.
    let points = parse_scalar_ground_truth(MECHANICAL_GROUND_TRUTH)
        .into_iter()
        .map(|(hours, measured)| {
            let predicted = super::mechanics::pressure_time_threshold_kpa(hours * 60.0);
            CrossValidationPoint {
                x: hours,
                measured,
                predicted,
                absolute_error: predicted - measured,
                relative_error_pct: relative_error_pct(measured, predicted),
            }
        })
        .collect::<Vec<_>>();
    let (rmse, mae, signed_bias) = cross_metrics(&points);

    let key_data_points = points
        .iter()
        .map(|point| DataPointCompare {
            label: format!("{:.2} h load", point.x),
            x: point.x,
            x_label: "Load duration".into(),
            x_unit: "h".into(),
            paper_value: point.measured,
            vide_value: point.predicted,
            absolute_error: point.absolute_error,
            relative_error_pct: point.relative_error_pct,
            unit: "kPa".into(),
        })
        .collect::<Vec<_>>();

    let highlight_hours = [0.5, 1.0, 2.0, 4.0, 8.0, 24.0];
    let mut experiment_metrics = highlight_hours
        .into_iter()
        .filter_map(|hours| {
            points.iter().find(|point| (point.x - hours).abs() < 1.0e-9).map(|point| {
                metric_pair(
                    format!("threshold_{hours}h"),
                    format!("Pressure threshold at {hours} h"),
                    "kPa",
                    Some(point.measured),
                    Some(point.predicted),
                    "checkpoint",
                    Some(format!(
                        "Published safe pressure at {hours} h of loading vs Vide's model prediction."
                    )),
                    None,
                )
            })
        })
        .collect::<Vec<_>>();
    experiment_metrics.push(metric_pair(
        "rmse",
        "RMSE (typical gap)",
        "kPa",
        None,
        Some(rmse),
        "summary",
        Some("Overall curve mismatch between the clinical reconstruction and Vide's screen.".into()),
        None,
    ));
    experiment_metrics.push(metric_pair(
        "mae",
        "MAE (average mismatch)",
        "kPa",
        None,
        Some(mae),
        "summary",
        None,
        None,
    ));
    experiment_metrics.push(metric_pair(
        "signed_bias",
        "Signed bias (you − study)",
        "kPa",
        None,
        Some(signed_bias),
        "summary",
        None,
        None,
    ));

    CrossValidationCase {
        case_id: "linares-reswick-rogers-2012",
        modality: "mechanical",
        title: "Human Reswick–Rogers pressure-duration curve transfer check",
        citation: "Linares OA, Mawson AR, Suarez E. J Basic Appl Sci. 2012;8:720-728. doi:10.6000/1927-5129.2012.08.02.64.",
        status: "External cross-model validation",
        x_label: "Load duration",
        x_unit: "h",
        metric_label: "Pressure threshold",
        metric_unit: "kPa",
        rmse,
        mae,
        signed_bias,
        points,
        key_data_points,
        experiment_metrics,
        caveats: vec![
            "The production criterion is a rat-muscle sigmoid screen; the comparison curve is a human clinical Reswick-Rogers reconstruction. Large disagreement is expected and must remain visible.",
            "Neither curve is a patient-specific pressure-injury boundary; shear, perfusion, posture and bony prominence geometry are omitted.",
        ],
    }
}

fn electrical_cross_validation() -> CrossValidationCase {
    // Independent patch-electrode median fit (rheobase 0.40 mA, chronaxie
    // 0.57 ms). The production model uses Kodama et al. intraepidermal Aδ data.
    const PAPER_RHEOBASE_MA: f64 = 0.40;
    const PAPER_CHRONAXIE_US: f64 = 570.0;
    const VIDE_RHEOBASE_MA: f64 = 0.178;
    const VIDE_CHRONAXIE_US: f64 = 270.0;

    let points = parse_scalar_ground_truth(ELECTRICAL_GROUND_TRUTH)
        .into_iter()
        .map(|(duration_us, measured)| {
            let predicted = super::nerve_threshold_current_ma(duration_us);
            CrossValidationPoint {
                x: duration_us,
                measured,
                predicted,
                absolute_error: predicted - measured,
                relative_error_pct: relative_error_pct(measured, predicted),
            }
        })
        .collect::<Vec<_>>();
    let (rmse, mae, signed_bias) = cross_metrics(&points);

    let key_data_points = points
        .iter()
        .map(|point| DataPointCompare {
            label: format!("{:.0} µs pulse", point.x),
            x: point.x,
            x_label: "Pulse duration".into(),
            x_unit: "µs".into(),
            paper_value: point.measured,
            vide_value: point.predicted,
            absolute_error: point.absolute_error,
            relative_error_pct: point.relative_error_pct,
            unit: "mA".into(),
        })
        .collect::<Vec<_>>();

    let mut experiment_metrics = vec![
        metric_pair(
            "rheobase",
            "Rheobase (I∞)",
            "mA",
            Some(PAPER_RHEOBASE_MA),
            Some(VIDE_RHEOBASE_MA),
            "parameter",
            Some("Minimum current for a very long pulse to be perceived.".into()),
            Some("Paper: patch-electrode median. Vide: intraepidermal Aδ default.".into()),
        ),
        metric_pair(
            "chronaxie",
            "Chronaxie",
            "µs",
            Some(PAPER_CHRONAXIE_US),
            Some(VIDE_CHRONAXIE_US),
            "parameter",
            Some("Pulse duration at twice rheobase — nerve excitability.".into()),
            Some("Electrode geometry differs by design in this transfer check.".into()),
        ),
    ];
    for point in &points {
        experiment_metrics.push(metric_pair(
            format!("threshold_{:.0}us", point.x),
            format!("Perception threshold @ {:.0} µs", point.x),
            "mA",
            Some(point.measured),
            Some(point.predicted),
            "checkpoint",
            Some("Published perception threshold vs Vide's strength–duration model.".into()),
            None,
        ));
    }
    experiment_metrics.push(metric_pair(
        "rmse",
        "RMSE (typical gap)",
        "mA",
        None,
        Some(rmse),
        "summary",
        Some("Overall curve mismatch for this cross-study transfer check.".into()),
        None,
    ));
    experiment_metrics.push(metric_pair(
        "mae",
        "MAE (average mismatch)",
        "mA",
        None,
        Some(mae),
        "summary",
        None,
        None,
    ));
    experiment_metrics.push(metric_pair(
        "signed_bias",
        "Signed bias (you − study)",
        "mA",
        None,
        Some(signed_bias),
        "summary",
        None,
        None,
    ));

    CrossValidationCase {
        case_id: "hugosdottir-2019-patch-electrode",
        modality: "electrical",
        title: "Patch-electrode sensory threshold transfer check",
        citation: "Hugosdottir R et al. BMC Neurosci. 2019;20:52. doi:10.1186/s12868-019-0530-8.",
        status: "Independent cross-study validation",
        x_label: "Pulse duration",
        x_unit: "µs",
        metric_label: "Perception threshold",
        metric_unit: "mA",
        rmse,
        mae,
        signed_bias,
        points,
        key_data_points,
        experiment_metrics,
        caveats: vec![
            "The validation study used a surface patch electrode; production defaults come from an intraepidermal Aδ electrode study. This intentionally tests transfer and is not expected to pass without electrode-specific calibration.",
            "Published median rheobase and chronaxie fits are compared, not individual-subject raw thresholds.",
        ],
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProofLabRequest {
    #[serde(default)]
    pub contact: Option<SimulationContact>,
    #[serde(default)]
    pub case_ids: Vec<String>,
    #[serde(default)]
    pub settings: SolverSettings,
}

const MECHANICAL_CASE_ID: &str = "linares-reswick-rogers-2012";
const ELECTRICAL_CASE_ID: &str = "hugosdottir-2019-patch-electrode";

fn site_label(manifest: &ProofLabCaseManifest) -> String {
    match manifest
        .protocol
        .options
        .get("skinProfileId")
        .map(String::as_str)
    {
        Some("volar-forearm") => "Volar forearm".into(),
        Some("dorsal-forearm") => "Dorsal forearm".into(),
        Some("palm") => "Palm".into(),
        Some("sole") => "Sole".into(),
        _ => "Skin contact site".into(),
    }
}

fn library_entry_from_manifest(manifest: &ProofLabCaseManifest) -> ProofLabLibraryEntry {
    ProofLabLibraryEntry {
        case_id: manifest.id.clone(),
        title: manifest.title.clone(),
        citation: manifest.citation.clone(),
        modality: "heat",
        measurement_target: Some(manifest.measurement_target),
        measurement_summary: manifest.measurement_note.clone(),
        site: site_label(manifest),
        setpoint_c: manifest.protocol.parameters.get("temperatureC").copied(),
        duration_s: manifest.protocol.parameters.get("durationS").copied(),
        status: "ready",
        requires_heat_contact: true,
        highlights: manifest.extracted_from_paper.clone(),
        unknowns: manifest.unknowns.clone(),
    }
}

fn cross_validation_library_entries() -> Vec<ProofLabLibraryEntry> {
    vec![
        ProofLabLibraryEntry {
            case_id: MECHANICAL_CASE_ID.into(),
            title: "Human Reswick–Rogers pressure-duration curve transfer check".into(),
            citation: "Linares OA, Mawson AR, Suarez E. J Basic Appl Sci. 2012;8:720-728.".into(),
            modality: "mechanical",
            measurement_target: None,
            measurement_summary:
                "Independent human clinical pressure–duration reconstruction vs Vide's sigmoid screen."
                    .into(),
            site: "Pressure injury criterion (cross-model)".into(),
            setpoint_c: None,
            duration_s: None,
            status: "transfer check",
            requires_heat_contact: false,
            highlights: vec![
                "Human Reswick–Rogers exponential reconstruction from Linares et al.".into(),
                "Vide uses a separate Linder–Ganz rat-muscle sigmoid — disagreement is expected.".into(),
            ],
            unknowns: vec![
                "Not a patient-specific injury boundary; shear and geometry omitted.".into(),
            ],
        },
        ProofLabLibraryEntry {
            case_id: ELECTRICAL_CASE_ID.into(),
            title: "Patch-electrode sensory threshold transfer check".into(),
            citation: "Hugosdottir R et al. BMC Neurosci. 2019;20:52.".into(),
            modality: "electrical",
            measurement_target: None,
            measurement_summary:
                "Patch-electrode median strength–duration fit vs Vide's intraepidermal Aδ defaults."
                    .into(),
            site: "Cutaneous perception threshold".into(),
            setpoint_c: None,
            duration_s: None,
            status: "transfer check",
            requires_heat_contact: false,
            highlights: vec![
                "Median rheobase 0.40 mA and chronaxie 0.57 ms from patch-electrode study.".into(),
                "Vide defaults from Kodama intraepidermal data — electrode transfer test.".into(),
            ],
            unknowns: vec![
                "Electrode geometry differs intentionally; poor scores must stay visible.".into(),
            ],
        },
    ]
}

/// Full research library for the Proof Lab picker.
pub fn proof_lab_library() -> Result<Vec<ProofLabLibraryEntry>, String> {
    let mut entries = proof_lab_cases()?
        .iter()
        .map(|bundle| library_entry_from_manifest(&bundle.manifest))
        .collect::<Vec<_>>();
    entries.extend(cross_validation_library_entries());
    Ok(entries)
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

/// Run the solver from the user's sidebar contact. Ground truth is not consulted.
fn run_user_prediction(
    user_contact: &SimulationContact,
    settings: &SolverSettings,
) -> Result<Vec<ThermalSample>, String> {
    if user_contact.stimulus_type != "heat" {
        return Err(
            "Proof Lab heat cases require a heat contact — set stimulus type to heat in the sidebar."
                .into(),
        );
    }
    let profile = super::model::skin_profile(
        user_contact.text("skinProfileId", super::model::DEFAULT_SKIN_PROFILE_ID),
    )
    .ok_or_else(|| "Unknown skin profile on sidebar contact.".to_string())?;
    let damage = super::model::damage_model(
        user_contact.text("damageModelId", super::model::DEFAULT_DAMAGE_MODEL_ID),
    )
    .ok_or_else(|| "Unknown damage model on sidebar contact.".to_string())?;
    let conductance = super::validation::resolve_conductance(user_contact, None)?;
    let case = build_case(user_contact, profile, damage, conductance);
    let contact_area_m2 = user_contact.number_or("contactAreaMm2", 25.0) * 1e-6;
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
        user_contact.text("solverDimension", "auto"),
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

fn peak_in_window(
    series: &[ThermalSample],
    start_s: f64,
    end_s: f64,
    target: MeasurementTarget,
) -> Option<f64> {
    series
        .iter()
        .filter(|sample| sample.time_s >= start_s && sample.time_s <= end_s)
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
    let (full_comparison, metrics) = compare_series(&window_measured, predicted, target)?;
    let peak_measured_c = window_measured
        .iter()
        .map(|sample| sample.temperature_c)
        .max_by(f64::total_cmp);
    let peak_predicted_c = peak_in_window(predicted, start_s, end_s, target);
    let experiment_metrics = heat_window_experiment_metrics(
        &full_comparison,
        &metrics,
        peak_measured_c,
        peak_predicted_c,
    );
    let key_data_points = key_heat_points(&full_comparison, "°C", "s");
    let comparison = downsample_comparison(&full_comparison, CHART_POINT_CAP);

    Ok(WindowComparison {
        label: label.to_string(),
        start_s,
        end_s,
        sample_count: window_measured.len(),
        metrics,
        comparison,
        key_data_points,
        experiment_metrics,
        peak_measured_c,
        peak_predicted_c,
    })
}

fn evaluate_case(
    bundle: ProofLabCaseBundle,
    user_contact: &SimulationContact,
    settings: &SolverSettings,
) -> Result<ProofLabCaseResult, String> {
    let ProofLabCaseBundle {
        manifest,
        ground_truth_csv,
    } = bundle;

    // Simulate from sidebar contact; compare afterward to published CSV.
    let predicted_series = run_user_prediction(user_contact, settings)?;

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

    let experiment_metrics = case_level_heat_metrics(&manifest, user_contact);

    let mut caveats = manifest.unknowns.clone();
    caveats.push(manifest.measurement_note.clone());
    caveats.push(format!(
        "Your sidebar contact \"{}\" was simulated; published CSV data was compared afterward.",
        user_contact.label
    ));
    if user_contact.number("temperatureC") != manifest.protocol.parameters.get("temperatureC").copied() {
        caveats.push(
            "Your heater setpoint differs from the study — temperature mismatches are expected."
                .into(),
        );
    }
    if user_contact.number("durationS") != manifest.protocol.parameters.get("durationS").copied() {
        caveats.push(
            "Your heating duration differs from the study — time-aligned comparison may be unfair."
                .into(),
        );
    }

    Ok(ProofLabCaseResult {
        case_id: manifest.id.clone(),
        title: manifest.title.clone(),
        citation: manifest.citation.clone(),
        modality: "heat",
        measurement_target: manifest.measurement_target,
        measurement_note: manifest.measurement_note.clone(),
        contact_label: user_contact.label.clone(),
        protocol_inputs: user_contact.parameters.clone(),
        protocol_options: user_contact.options.clone(),
        paper_reference_inputs: manifest.protocol.parameters.clone(),
        paper_reference_options: manifest.protocol.options.clone(),
        uses_user_contact: true,
        predicted_series,
        measured_series,
        windows,
        experiment_metrics,
        extracted_from_paper: manifest.extracted_from_paper.clone(),
        unknowns: manifest.unknowns.clone(),
        caveats,
    })
}

pub fn run_proof_lab(request: ProofLabRequest) -> Result<ProofLabReport, String> {
    let mut settings = request.settings;
    settings.run_convergence_check = false;
    settings.run_sensitivity = false;

    if request.case_ids.is_empty() {
        return Err("Select at least one study from the research library.".into());
    }

    let selected: std::collections::HashSet<String> =
        request.case_ids.iter().cloned().collect();

    let library = proof_lab_library()?;
    for id in &request.case_ids {
        if !library.iter().any(|entry| entry.case_id == *id) {
            return Err(format!("Unknown Proof Lab study id: {id}"));
        }
    }

    let heat_selected = proof_lab_cases()?
        .into_iter()
        .filter(|bundle| selected.contains(&bundle.manifest.id))
        .collect::<Vec<_>>();

    let needs_heat = !heat_selected.is_empty();
    let user_contact = if needs_heat {
        let contact = request.contact.ok_or_else(|| {
            "Heat studies require a sidebar heat contact. Add one and select it above.".to_string()
        })?;
        if contact.stimulus_type != "heat" {
            return Err(
                "Selected heat studies require stimulus type heat on the sidebar contact.".into(),
            );
        }
        Some(contact)
    } else {
        request.contact
    };

    let mut cases = Vec::new();
    if let Some(ref contact) = user_contact {
        for bundle in heat_selected {
            cases.push(evaluate_case(bundle, contact, &settings)?);
        }
    }

    let mut cross_validation_cases = Vec::new();
    if selected.contains(MECHANICAL_CASE_ID) {
        cross_validation_cases.push(mechanical_cross_validation());
    }
    if selected.contains(ELECTRICAL_CASE_ID) {
        cross_validation_cases.push(electrical_cross_validation());
    }

    if cases.is_empty() && cross_validation_cases.is_empty() {
        return Err("No studies matched the selection.".into());
    }

    let generated_at_unix_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0);

    Ok(ProofLabReport {
        model_version: MODEL_VERSION,
        generated_at_unix_ms,
        disclosure: "Proof Lab runs your sidebar contact settings against each selected study's published measurements. Protocol differences (temperature, duration, geometry) are shown explicitly. No experimental pass/fail claim.",
        selected_case_ids: request.case_ids,
        cases,
        cross_validation_cases,
    })
}

/// Compact JSON payload for AI analysis (avoids shipping full time series).
pub fn proof_lab_analysis_payload(report: &ProofLabReport) -> serde_json::Value {
    let cases = report.cases.iter().map(|case| {
        let windows = case.windows.iter().map(|window| {
            serde_json::json!({
                "label": window.label,
                "sampleCount": window.sample_count,
                "rmseC": window.metrics.rmse_c,
                "maeC": window.metrics.mae_c,
                "signedBiasC": window.metrics.signed_bias_c,
                "keyDataPoints": window.key_data_points.iter().take(16).collect::<Vec<_>>(),
                "experimentMetrics": window.experiment_metrics,
            })
        }).collect::<Vec<_>>();
        serde_json::json!({
            "caseId": case.case_id,
            "title": case.title,
            "citation": case.citation,
            "modality": case.modality,
            "measurementNote": case.measurement_note,
            "extractedFromPaper": case.extracted_from_paper,
            "unknowns": case.unknowns,
            "experimentMetrics": case.experiment_metrics,
            "windows": windows,
        })
    }).collect::<Vec<_>>();

    let cross = report.cross_validation_cases.iter().map(|case| {
        serde_json::json!({
            "caseId": case.case_id,
            "title": case.title,
            "citation": case.citation,
            "modality": case.modality,
            "status": case.status,
            "rmse": case.rmse,
            "mae": case.mae,
            "signedBias": case.signed_bias,
            "keyDataPoints": case.key_data_points,
            "experimentMetrics": case.experiment_metrics,
            "caveats": case.caveats,
        })
    }).collect::<Vec<_>>();

    serde_json::json!({
        "modelVersion": report.model_version,
        "disclosure": report.disclosure,
        "cases": cases,
        "crossValidationCases": cross,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mayrovitz_request() -> ProofLabRequest {
        let manifest: ProofLabCaseManifest = serde_json::from_str(MAYROVITZ_PROTOCOL).unwrap();
        let case_id = manifest.id.clone();
        ProofLabRequest {
            contact: Some(contact_from_protocol(&manifest)),
            case_ids: vec![case_id],
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

    fn all_studies_request() -> ProofLabRequest {
        let manifest: ProofLabCaseManifest = serde_json::from_str(MAYROVITZ_PROTOCOL).unwrap();
        ProofLabRequest {
            contact: Some(contact_from_protocol(&manifest)),
            case_ids: proof_lab_library()
                .expect("library")
                .into_iter()
                .map(|entry| entry.case_id)
                .collect(),
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

    #[test]
    fn proof_lab_library_lists_all_studies() {
        let library = proof_lab_library().expect("library");
        assert_eq!(library.len(), 5);
        assert!(library.iter().any(|e| e.case_id.contains("mayrovitz")));
        assert!(library.iter().any(|e| e.modality == "mechanical"));
    }

    #[test]
    fn user_prediction_does_not_require_ground_truth_at_compile_boundary() {
        let manifest: ProofLabCaseManifest = serde_json::from_str(WANG_EPOS_PROTOCOL).unwrap();
        let contact = contact_from_protocol(&manifest);
        let predicted = run_user_prediction(&contact, &mayrovitz_request().settings).expect("prediction");
        assert!(!predicted.is_empty());
    }

    #[test]
    fn proof_lab_runs_skin_and_interface_cases() {
        let report = run_proof_lab(all_studies_request()).expect("report");
        assert_eq!(report.cases.len(), 3);
        assert_eq!(report.cross_validation_cases.len(), 2);
        assert!(report
            .cross_validation_cases
            .iter()
            .all(|case| case.rmse.is_finite() && case.mae.is_finite()));
        assert!(report
            .cross_validation_cases
            .iter()
            .all(|case| !case.key_data_points.is_empty() && !case.experiment_metrics.is_empty()));

        assert!(report.cases.iter().all(|case| case.uses_user_contact));
        assert!(report
            .cases
            .iter()
            .all(|case| !case.paper_reference_inputs.is_empty()));

        let mayrovitz = report
            .cases
            .iter()
            .find(|case| case.case_id.contains("mayrovitz"))
            .expect("mayrovitz");
        assert_eq!(mayrovitz.measurement_target, MeasurementTarget::SkinSurface);
        assert!(!mayrovitz.experiment_metrics.is_empty());
        assert_eq!(mayrovitz.windows[0].key_data_points.len(), 2);
        let mayrovitz_rmse = mayrovitz.windows[0].metrics.rmse_c.expect("rmse");
        assert!(
            mayrovitz_rmse < 0.5,
            "Mayrovitz skin RMSE {mayrovitz_rmse:.3} °C too large when using matching protocol contact"
        );

        let petrofsky = report
            .cases
            .iter()
            .find(|case| case.case_id.contains("petrofsky"))
            .expect("petrofsky");
        assert_eq!(petrofsky.measurement_target, MeasurementTarget::SkinSurface);
        assert!(petrofsky.windows[0].metrics.rmse_c.expect("rmse").is_finite());

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
        assert!(hold.metrics.rmse_c.expect("hold rmse").is_finite());
        assert!(hold.comparison.len() <= CHART_POINT_CAP);
        assert!(!hold.key_data_points.is_empty());
        assert!(!hold.experiment_metrics.is_empty());
    }
}
