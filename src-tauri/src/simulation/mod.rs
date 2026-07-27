//! Heat-contact simulation entry point.
//!
//! Scope: a one-dimensional layered Pennes bioheat model with a finite contact
//! conductance at the skin surface and an Arrhenius damage integral. It is a
//! research tool. It has been verified against analytic solutions (see
//! `verification`) but has not been validated against published experimental
//! data, and nothing it produces is clinical advice.

pub mod contact;
pub mod mechanics;
pub mod model;
pub mod proof_lab;
pub mod solver;
pub mod solver_axisymmetric;
pub mod timeline;
pub mod validation;
pub mod verification;

use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use contact::{check_dimensionality, contact_network, ContactNetwork, DimensionalityCheck};
use model::{
    burn_classification, damage_model, device_material, interface_material, skin_profile,
    DamageModel, DeviceMaterial, InterfaceMaterial, SkinProfile, DEFAULT_DAMAGE_MODEL_ID,
    DEFAULT_DEVICE_MATERIAL_ID, DEFAULT_INTERFACE_MATERIAL_ID, DEFAULT_SKIN_PROFILE_ID,
    MODEL_VERSION,
};
use solver::{
    build_mesh, steady_state, BloodProperties, DeviceControl, DeviceModel, LayerMaterial,
    PerfusionModel, Phase, SolverState, SurfaceCoupling,
};
use timeline::{ProtocolTimeline, TimelineSegment, TimelineSegmentKind};
use verification::{convergence_metric, ConvergenceReport, VerificationSuite};

/// Combined natural convection and linearised radiation from bare skin or a
/// device back face to still room air.
///
/// h_rad ≈ 4·ε·σ·T̄³ ≈ 6 W/(m²·K) near 305 K, plus roughly 5 W/(m²·K) of
/// natural convection. Evaporative loss is not included.
const AMBIENT_COEFFICIENT_W_PER_M2_K: f64 = 11.0;

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationRequest {
    pub contacts: Vec<SimulationContact>,
    #[serde(default)]
    pub settings: SolverSettings,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationContact {
    pub id: String,
    pub label: String,
    pub stimulus_type: String,
    pub parameters: HashMap<String, f64>,
    #[serde(default)]
    pub options: HashMap<String, String>,
}

impl SimulationContact {
    fn number(&self, key: &str) -> Option<f64> {
        self.parameters.get(key).copied().filter(|v| v.is_finite())
    }

    pub(crate) fn number_or(&self, key: &str, fallback: f64) -> f64 {
        self.number(key).unwrap_or(fallback)
    }

    pub(crate) fn text<'a>(&'a self, key: &str, fallback: &'a str) -> &'a str {
        self.options
            .get(key)
            .map(String::as_str)
            .filter(|value| !value.is_empty())
            .unwrap_or(fallback)
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverSettings {
    /// Width of the cell at the skin surface, in micrometres.
    pub surface_cell_um: f64,
    /// Upper bound on cell width in deep tissue, in micrometres.
    pub max_cell_um: f64,
    /// Geometric growth ratio between consecutive cells.
    pub growth_ratio: f64,
    /// Base timestep in milliseconds. Clamped against the exposure length so
    /// long runs stay responsive; Crank–Nicolson has no stability limit here.
    pub time_step_ms: f64,
    pub run_convergence_check: bool,
    pub run_sensitivity: bool,
}

impl Default for SolverSettings {
    fn default() -> Self {
        Self {
            surface_cell_um: 5.0,
            max_cell_um: 400.0,
            growth_ratio: 1.12,
            time_step_ms: 20.0,
            run_convergence_check: true,
            run_sensitivity: true,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedSolverSettings {
    pub surface_cell_um: f64,
    pub max_cell_um: f64,
    pub growth_ratio: f64,
    pub time_step_ms: f64,
    pub scheme: &'static str,
    pub cell_count: usize,
    pub step_count: usize,
    pub domain_depth_mm: f64,
    /// Resolved dimensionality: `1d` or `axisymmetric`.
    pub solver_dimension: &'static str,
    /// User request: `auto`, `1d`, or `axisymmetric`.
    pub solver_dimension_requested: &'static str,
    pub radial_cell_count: Option<usize>,
    pub radial_domain_mm: Option<f64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SolverDimension {
    OneD,
    Axisymmetric,
}

impl SolverDimension {
    fn label(self) -> &'static str {
        match self {
            Self::OneD => "1d",
            Self::Axisymmetric => "axisymmetric",
        }
    }
}

pub fn resolve_solver_dimension(option: &str, dim: &DimensionalityCheck) -> SolverDimension {
    match option {
        "1d" => SolverDimension::OneD,
        "axisymmetric" | "r-z" | "2d" | "3d" | "3d-local" => SolverDimension::Axisymmetric,
        _ => {
            if dim.fourier_number >= 0.02 {
                SolverDimension::Axisymmetric
            } else {
                SolverDimension::OneD
            }
        }
    }
}

fn requested_dimension_label(option: &str) -> &'static str {
    match option {
        "1d" => "1d",
        "axisymmetric" | "r-z" | "2d" | "3d" | "3d-local" => "axisymmetric",
        _ => "auto",
    }
}

// ---------------------------------------------------------------------------
// Response
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationResponse {
    pub model: ModelMetadata,
    pub contacts: Vec<ContactSimulationResult>,
    pub unsupported_contacts: Vec<UnsupportedContact>,
    pub manifest: RunManifest,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelMetadata {
    pub name: &'static str,
    pub version: &'static str,
    pub scope: &'static str,
    pub governing_equations: &'static [&'static str],
    pub numerics: &'static str,
    pub citations: &'static [&'static str],
    pub disclaimer: &'static str,
    pub validation_status: &'static str,
}

/// Everything needed to reproduce or audit a run later.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunManifest {
    pub model_version: &'static str,
    pub generated_at_unix_ms: u64,
    pub contact_count: usize,
    pub verification: VerificationSuite,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactSimulationResult {
    pub contact_point_id: String,
    pub label: String,
    pub inputs: ResolvedInputs,
    /// Modality-neutral form of the legacy exposure/cooling parameters.
    pub protocol_timeline: ProtocolTimeline,
    pub skin_profile: &'static SkinProfile,
    pub device_material: &'static DeviceMaterial,
    pub interface_material: &'static InterfaceMaterial,
    pub damage_model: &'static DamageModel,
    pub contact: ContactNetwork,
    pub dimensionality: DimensionalityCheck,
    pub summary: ResultSummary,
    pub series: Vec<ThermalSample>,
    pub depth_profile: Vec<DepthSample>,
    pub energy: EnergyReport,
    pub bounds: ResultBounds,
    pub sensitivity: Vec<SensitivityEntry>,
    pub convergence: Option<ConvergenceReport>,
    pub solver: ResolvedSolverSettings,
    pub warnings: Vec<String>,
    /// Surface temperature vs radius at end of run (axisymmetric mode only).
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub radial_profile: Vec<RadialSample>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub electrical: Option<ElectricalReport>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ElectricalLayerResult {
    pub name: &'static str,
    pub depth_start_mm: f64,
    pub depth_end_mm: f64,
    pub conductivity_s_per_m: f64,
    pub conductivity_confidence: &'static str,
    pub current_density_a_per_m2: f64,
    pub power_density_w_per_m3: f64,
    pub voltage_drop_v: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NerveActivationResult {
    pub pulse_duration_us: f64,
    pub applied_current_ma: f64,
    pub threshold_current_ma: f64,
    pub rheobase_ma: f64,
    pub chronaxie_us: f64,
    pub activation_margin: f64,
    pub classification: &'static str,
    pub confidence: &'static str,
    pub citation: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ElectricalReport {
    pub waveform_type: String,
    pub drive_mode: String,
    pub peak_current_ma: f64,
    pub rms_current_ma: f64,
    pub applied_voltage_v: f64,
    pub tissue_resistance_ohm: f64,
    pub interface_impedance_ohm: f64,
    pub total_impedance_ohm: f64,
    pub current_density_a_per_m2: f64,
    pub total_power_w: f64,
    pub charge_per_pulse_uc: f64,
    pub charge_density_uc_per_cm2: f64,
    pub layers: Vec<ElectricalLayerResult>,
    pub nerve_activation: NerveActivationResult,
    pub return_path_assumption: &'static str,
    pub confidence: &'static str,
    pub citation: &'static str,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RadialSample {
    pub radius_mm: f64,
    pub peak_surface_temperature_c: f64,
    pub final_surface_temperature_c: f64,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedInputs {
    pub device_setpoint_c: f64,
    pub pre_exposure_s: f64,
    pub exposure_s: f64,
    pub post_exposure_s: f64,
    pub contact_area_mm2: f64,
    pub device_thickness_mm: f64,
    pub contact_pressure_kpa: f64,
    pub interface_thickness_um: f64,
    pub ambient_temperature_c: f64,
    pub baseline_skin_temperature_c: f64,
    pub device_control: &'static str,
    /// `None` for an ideal device, which by definition has unlimited capacity.
    pub device_areal_heat_capacity_j_per_m2_k: Option<f64>,
    pub contact_conductance_w_per_m2_k: f64,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResultSummary {
    pub peak_surface_temperature_c: f64,
    pub peak_basal_temperature_c: f64,
    pub peak_dermal_base_temperature_c: f64,
    pub final_surface_temperature_c: f64,
    pub final_device_temperature_c: f64,
    pub time_to_44c_s: Option<f64>,
    pub basal_depth_mm: f64,
    pub dermal_base_depth_mm: f64,
    pub omega_basal: f64,
    pub omega_dermal_base: f64,
    /// Sapareto-Dewey cumulative equivalent minutes at 43 °C, evaluated
    /// from the basal-layer temperature history.
    pub cem43_basal_minutes: f64,
    /// Reference dose used only to flag disagreement; not a universal injury
    /// threshold across tissues or heating rates.
    pub cem43_reference_minutes: f64,
    pub thermal_dose_disagreement: bool,
    pub comfort_classification: &'static str,
    /// Depth at which the damage integral reaches unity, if it does.
    pub damage_depth_mm: Option<f64>,
    pub risk_classification: &'static str,
    pub peak_surface_flux_w_per_m2: f64,
    pub total_energy_delivered_j: f64,
}

fn cem43_minutes(series: &[ThermalSample]) -> f64 {
    series
        .windows(2)
        .map(|pair| {
            let dt_minutes = (pair[1].time_s - pair[0].time_s).max(0.0) / 60.0;
            let temperature_c =
                (pair[0].basal_temperature_c + pair[1].basal_temperature_c) * 0.5;
            let r: f64 = if temperature_c > 43.0 { 0.5 } else { 0.25 };
            dt_minutes * r.powf(43.0 - temperature_c)
        })
        .sum()
}

fn comfort_classification(peak_surface_c: f64) -> &'static str {
    if peak_surface_c < 38.0 {
        "Comfortable"
    } else if peak_surface_c < 43.0 {
        "Warm"
    } else if peak_surface_c < 45.0 {
        "Uncomfortable"
    } else {
        "Painful"
    }
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThermalSample {
    pub time_s: f64,
    pub surface_temperature_c: f64,
    pub basal_temperature_c: f64,
    pub dermal_base_temperature_c: f64,
    pub device_temperature_c: f64,
    pub damage_omega: f64,
    pub surface_flux_w_per_m2: f64,
    pub phase: &'static str,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DepthSample {
    pub depth_mm: f64,
    pub peak_temperature_c: f64,
    pub final_temperature_c: f64,
    pub damage_omega: f64,
    pub layer: &'static str,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnergyReport {
    pub surface_in_j_per_m2: f64,
    pub core_out_j_per_m2: f64,
    pub perfusion_out_j_per_m2: f64,
    pub metabolic_in_j_per_m2: f64,
    pub stored_j_per_m2: f64,
    pub residual_j_per_m2: f64,
    pub relative_residual: f64,
    pub balanced: bool,
}

/// Bracketing runs that show how much the answer depends on assumptions the
/// 1D model cannot resolve.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResultBounds {
    /// Peak basal temperature from the nominal 1D run.
    pub nominal_peak_basal_c: f64,
    /// Same case with constriction resistance added, approximating the effect
    /// of lateral heat spreading away from a finite contact patch.
    pub lateral_bound_peak_basal_c: f64,
    pub lateral_bound_omega: f64,
    /// Envelope across the one-at-a-time property sensitivity runs.
    pub sensitivity_low_peak_basal_c: f64,
    pub sensitivity_high_peak_basal_c: f64,
    pub note: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SensitivityEntry {
    pub parameter: String,
    pub unit: &'static str,
    pub baseline: f64,
    pub low: f64,
    pub high: f64,
    pub peak_basal_low_c: f64,
    pub peak_basal_high_c: f64,
    pub omega_low: f64,
    pub omega_high: f64,
    /// Spread in peak basal temperature caused by this parameter alone.
    pub peak_basal_span_c: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnsupportedContact {
    pub contact_point_id: String,
    pub label: String,
    pub stimulus_type: String,
    pub reason: &'static str,
}

// ---------------------------------------------------------------------------
// Case setup
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy)]
pub(crate) enum DeviceSpec {
    /// Device held at its setpoint by an unmodelled controller.
    Ideal { setpoint_c: f64 },
    /// Device with finite thermal mass, solved alongside the tissue.
    Dynamic(DeviceModel),
}

#[derive(Debug, Clone)]
pub(crate) struct HeatCase {
    layers: Vec<LayerMaterial>,
    /// Additional volumetric heat source active only during exposure, used by
    /// electrical Joule heating. Indexed by tissue layer.
    exposure_source_w_per_m3: Vec<f64>,
    protocol_timeline: ProtocolTimeline,
    uses_thermal_timeline: bool,
    blood: BloodProperties,
    core_c: f64,
    baseline_skin_c: f64,
    pub(crate) contact_conductance: f64,
    device: DeviceSpec,
    pre_exposure_s: f64,
    exposure_s: f64,
    post_exposure_s: f64,
    ambient_c: f64,
    damage: &'static DamageModel,
    basal_depth_m: f64,
    dermal_base_depth_m: f64,
    perfusion_model: PerfusionModel,
}

pub(crate) struct CaseOutput {
    pub(crate) peak_surface_c: f64,
    pub(crate) peak_basal_c: f64,
    peak_dermal_base_c: f64,
    final_surface_c: f64,
    final_device_c: f64,
    pub(crate) time_to_44c_s: Option<f64>,
    omega_basal: f64,
    omega_dermal_base: f64,
    damage_depth_m: Option<f64>,
    peak_surface_flux: f64,
    pub(crate) series: Vec<ThermalSample>,
    depth_profile: Vec<DepthSample>,
    pub(crate) radial_profile: Vec<RadialSample>,
    energy: EnergyReport,
    cell_count: usize,
    step_count: usize,
    domain_depth_m: f64,
}

fn layers_from_profile(profile: &SkinProfile) -> Vec<LayerMaterial> {
    profile
        .layers
        .iter()
        .map(|layer| LayerMaterial {
            thickness_m: layer.thickness_m.value,
            density_kg_per_m3: layer.density_kg_per_m3.value,
            specific_heat_j_per_kg_k: layer.specific_heat_j_per_kg_k.value,
            conductivity_w_per_m_k: layer.conductivity_w_per_m_k.value,
            perfusion_per_s: layer.perfusion_per_s.value,
            metabolic_w_per_m3: layer.metabolic_w_per_m3.value,
        })
        .collect()
}

pub(crate) fn layer_name(profile: &SkinProfile, index: usize) -> &'static str {
    profile
        .layers
        .get(index)
        .map(|layer| layer.name)
        .unwrap_or("Tissue")
}

/// Run one fully specified case with the selected spatial dimension.
pub(crate) fn solve_heat_case(
    case: &HeatCase,
    settings: &SolverSettings,
    profile: &'static SkinProfile,
    contact_area_m2: f64,
    dimension: SolverDimension,
    collect_series: bool,
) -> CaseOutput {
    match dimension {
        SolverDimension::OneD => {
            let mut output = solve_case(case, settings, profile, collect_series);
            output.radial_profile.clear();
            output
        }
        SolverDimension::Axisymmetric => {
            let radius = contact::contact_radius_m(contact_area_m2);
            solver_axisymmetric::solve_axisymmetric_case(
                case,
                settings,
                profile,
                radius,
                collect_series,
            )
        }
    }
}

/// Run one fully specified case (1-D path).
pub(crate) fn solve_case(
    case: &HeatCase,
    settings: &SolverSettings,
    profile: &'static SkinProfile,
    collect_series: bool,
) -> CaseOutput {
    let mesh = build_mesh(
        &case.layers,
        settings.surface_cell_um * 1e-6,
        settings.max_cell_um * 1e-6,
        settings.growth_ratio,
        case.blood,
        case.core_c,
    );

    let cell_count = mesh.cell_count();
    let domain_depth_m = mesh.depth_m;
    let basal_depth = case.basal_depth_m;
    let dermal_depth = case.dermal_base_depth_m;

    // Start from the resting gradient rather than a uniform body temperature;
    // skin already sits well below core before anything touches it.
    let initial = steady_state(&mesh, case.baseline_skin_c);
    let setpoint_c = match case.device {
        DeviceSpec::Ideal { setpoint_c } => setpoint_c,
        DeviceSpec::Dynamic(device) => device.setpoint_c,
    };
    let initial_device_c = if case.pre_exposure_s > 0.0 {
        case.baseline_skin_c
    } else {
        setpoint_c
    };
    let mut state =
        SolverState::with_perfusion(mesh, initial, initial_device_c, case.perfusion_model);

    let total_s = case.pre_exposure_s + case.exposure_s + case.post_exposure_s;
    let dt = (settings.time_step_ms / 1000.0)
        .min((total_s / 500.0).max(0.001))
        .clamp(0.0005, 0.1);
    let sample_interval = (total_s / 400.0).max(dt);

    let mut series: Vec<ThermalSample> = Vec::new();
    let mut peak_surface_flux: f64 = 0.0;
    let mut time_to_44c: Option<f64> = None;
    let mut next_sample = 0.0;
    let mut step_count = 0usize;
    let mut previous_basal = state.mesh.interpolate(&state.temperature_c, basal_depth);
    let mut previous_time = 0.0;

    // Peaks are tracked on depth-interpolated values rather than on whichever
    // cell happens to straddle the marker depth, so refining the mesh does not
    // silently change which depth is being reported.
    let mut peak_surface = case.baseline_skin_c;
    let mut peak_basal = previous_basal;
    let mut peak_dermal = state.mesh.interpolate(&state.temperature_c, dermal_depth);

    if collect_series {
        series.push(ThermalSample {
            time_s: 0.0,
            surface_temperature_c: case.baseline_skin_c,
            basal_temperature_c: previous_basal,
            dermal_base_temperature_c: peak_dermal,
            device_temperature_c: initial_device_c,
            damage_omega: 0.0,
            surface_flux_w_per_m2: 0.0,
            phase: if case.pre_exposure_s > 0.0 {
                "baseline"
            } else {
                "exposure"
            },
        });
        next_sample = sample_interval;
    }

    let mut observe = |state: &mut SolverState, flux: f64, phase: &'static str| {
        step_count += 1;
        peak_surface_flux = peak_surface_flux.max(flux);

        let surface = state.mesh.surface_temperature(state.temperature_c[0], flux);
        let basal = state.mesh.interpolate(&state.temperature_c, basal_depth);
        let dermal = state.mesh.interpolate(&state.temperature_c, dermal_depth);

        peak_surface = peak_surface.max(surface);
        peak_basal = peak_basal.max(basal);
        peak_dermal = peak_dermal.max(dermal);

        if time_to_44c.is_none() && basal >= 44.0 {
            // Interpolate within the step rather than snapping to the step end.
            let span = basal - previous_basal;
            let fraction = if span.abs() > 1e-12 {
                ((44.0 - previous_basal) / span).clamp(0.0, 1.0)
            } else {
                1.0
            };
            time_to_44c = Some(previous_time + fraction * (state.elapsed_s - previous_time));
        }
        previous_basal = basal;
        previous_time = state.elapsed_s;

        if collect_series && state.elapsed_s + 1e-12 >= next_sample {
            series.push(ThermalSample {
                time_s: state.elapsed_s,
                surface_temperature_c: surface,
                basal_temperature_c: basal,
                dermal_base_temperature_c: dermal,
                device_temperature_c: state.device_temperature_c,
                damage_omega: state.mesh.interpolate(&state.omega, basal_depth),
                surface_flux_w_per_m2: flux,
                phase,
            });
            next_sample += sample_interval;
        }
    };

    if case.pre_exposure_s > 0.0 {
        state.run_phase(
            Phase {
                duration_s: case.pre_exposure_s,
                surface: SurfaceCoupling::Conductance {
                    conductance: AMBIENT_COEFFICIENT_W_PER_M2_K,
                    external_c: case.ambient_c,
                },
                device: None,
            },
            dt,
            case.damage,
            |state, flux| observe(state, flux, "baseline"),
        );
    }

    for cell in &mut state.mesh.cells {
        cell.metabolic_w_per_m3 += case
            .exposure_source_w_per_m3
            .get(cell.layer_index)
            .copied()
            .unwrap_or(0.0);
    }

    if case.uses_thermal_timeline {
        for segment in case
            .protocol_timeline
            .segments
            .iter()
            .filter(|segment| segment.start_value.is_some() && segment.duration_s > 0.0)
        {
            match segment.kind {
                TimelineSegmentKind::Hold => {
                    state.run_phase(
                        Phase {
                            duration_s: segment.duration_s,
                            surface: SurfaceCoupling::Conductance {
                                conductance: case.contact_conductance,
                                external_c: segment.start_value.unwrap_or(setpoint_c),
                            },
                            device: None,
                        },
                        dt,
                        case.damage,
                        |state, flux| observe(state, flux, "hold"),
                    );
                }
                TimelineSegmentKind::Ramp => {
                    let start = segment.start_value.unwrap_or(setpoint_c);
                    let end = segment.end_value.unwrap_or(start);
                    let pieces = (segment.duration_s / 0.5).ceil().clamp(1.0, 200.0) as usize;
                    for piece in 0..pieces {
                        let fraction = (piece as f64 + 0.5) / pieces as f64;
                        let external_c = start + (end - start) * fraction;
                        state.run_phase(
                            Phase {
                                duration_s: segment.duration_s / pieces as f64,
                                surface: SurfaceCoupling::Conductance {
                                    conductance: case.contact_conductance,
                                    external_c,
                                },
                                device: None,
                            },
                            dt,
                            case.damage,
                            |state, flux| observe(state, flux, "ramp"),
                        );
                    }
                }
                TimelineSegmentKind::Release => {
                    state.run_phase(
                        Phase {
                            duration_s: segment.duration_s,
                            surface: SurfaceCoupling::Conductance {
                                conductance: AMBIENT_COEFFICIENT_W_PER_M2_K,
                                external_c: case.ambient_c,
                            },
                            device: None,
                        },
                        dt,
                        case.damage,
                        |state, flux| observe(state, flux, "release"),
                    );
                }
                TimelineSegmentKind::Repeat => {}
            }
        }
    } else {
        let exposure_phase = match case.device {
            DeviceSpec::Ideal { setpoint_c } => Phase {
                duration_s: case.exposure_s,
                surface: SurfaceCoupling::Conductance {
                    conductance: case.contact_conductance,
                    external_c: setpoint_c,
                },
                device: None,
            },
            DeviceSpec::Dynamic(device) => Phase {
                duration_s: case.exposure_s,
                surface: SurfaceCoupling::Device {
                    conductance: case.contact_conductance,
                },
                device: Some(device),
            },
        };

        state.run_phase(exposure_phase, dt, case.damage, |state, flux| {
            observe(state, flux, "exposure")
        });
    }

    for cell in &mut state.mesh.cells {
        cell.metabolic_w_per_m3 -= case
            .exposure_source_w_per_m3
            .get(cell.layer_index)
            .copied()
            .unwrap_or(0.0);
    }

    // Once the device is removed the skin keeps cooling slowly, and the damage
    // integral keeps accumulating while it is still above threshold. Stopping
    // at the end of contact would under-report Ω.
    if case.post_exposure_s > 0.0 {
        state.run_phase(
            Phase {
                duration_s: case.post_exposure_s,
                surface: SurfaceCoupling::Conductance {
                    conductance: AMBIENT_COEFFICIENT_W_PER_M2_K,
                    external_c: case.ambient_c,
                },
                device: None,
            },
            dt,
            case.damage,
            |state, flux| observe(state, flux, "cooling"),
        );
    }

    let depth_profile = if collect_series {
        state
            .mesh
            .cells
            .iter()
            .enumerate()
            .map(|(index, cell)| DepthSample {
                depth_mm: cell.center_m * 1000.0,
                peak_temperature_c: state.peak_temperature_c[index],
                final_temperature_c: state.temperature_c[index],
                damage_omega: state.omega[index],
                layer: layer_name(profile, cell.layer_index),
            })
            .filter(|sample| sample.depth_mm <= 8.0)
            .collect()
    } else {
        Vec::new()
    };

    let ledger = state.energy;
    let relative_residual = ledger.relative_residual();

    CaseOutput {
        peak_surface_c: peak_surface,
        peak_basal_c: peak_basal,
        peak_dermal_base_c: peak_dermal,
        final_surface_c: state.temperature_c[0],
        final_device_c: state.device_temperature_c,
        time_to_44c_s: time_to_44c,
        omega_basal: state.mesh.interpolate(&state.omega, basal_depth),
        omega_dermal_base: state.mesh.interpolate(&state.omega, dermal_depth),
        damage_depth_m: damage_depth(&state),
        peak_surface_flux,
        series,
        depth_profile,
        radial_profile: Vec::new(),
        energy: EnergyReport {
            surface_in_j_per_m2: ledger.surface_in_j_per_m2,
            core_out_j_per_m2: ledger.core_out_j_per_m2,
            perfusion_out_j_per_m2: ledger.perfusion_out_j_per_m2,
            metabolic_in_j_per_m2: ledger.metabolic_in_j_per_m2,
            stored_j_per_m2: ledger.stored_j_per_m2,
            residual_j_per_m2: ledger.residual_j_per_m2(),
            relative_residual,
            balanced: relative_residual < 1e-6,
        },
        cell_count,
        step_count,
        domain_depth_m,
    }
}

/// Estimate what the basal response would have been if lateral heat spreading
/// away from a finite contact patch were accounted for.
///
/// Each sample's temperature *rise* is scaled by the analytic disc-source
/// factor for that instant, then the damage integral is recomputed from the
/// corrected history. This brackets the 1D answer from below without needing a
/// second solve, and it collapses to no correction for a large pad.
fn lateral_bound(
    series: &[ThermalSample],
    basal_depth_m: f64,
    diffusivity: f64,
    contact_area_m2: f64,
    damage: &DamageModel,
) -> (f64, f64) {
    let Some(first) = series.first() else {
        return (f64::NAN, 0.0);
    };

    let baseline = first.basal_temperature_c;
    let radius = contact::contact_radius_m(contact_area_m2);

    let mut peak = baseline;
    let mut omega = 0.0;
    let mut previous_rate = 0.0;
    let mut previous_time = first.time_s;

    for sample in series {
        let factor =
            contact::axial_spreading_factor(basal_depth_m, diffusivity, sample.time_s, radius);
        let corrected = baseline + factor * (sample.basal_temperature_c - baseline);
        peak = peak.max(corrected);

        let rate = damage.rate(corrected);
        omega += 0.5 * (rate + previous_rate) * (sample.time_s - previous_time);
        previous_rate = rate;
        previous_time = sample.time_s;
    }

    (peak, omega)
}

/// Deepest point at which the damage integral reaches unity, interpolated
/// between cell centres.
fn damage_depth(state: &SolverState) -> Option<f64> {
    let cells = &state.mesh.cells;
    if state.omega.first().copied().unwrap_or(0.0) < 1.0 {
        return None;
    }

    for index in 1..cells.len() {
        if state.omega[index] < 1.0 {
            let upper = state.omega[index - 1];
            let lower = state.omega[index];
            let span = upper - lower;
            let fraction = if span.abs() > 1e-12 {
                ((upper - 1.0) / span).clamp(0.0, 1.0)
            } else {
                0.0
            };
            let left = cells[index - 1].center_m;
            let right = cells[index].center_m;
            return Some(left + fraction * (right - left));
        }
    }
    Some(cells[cells.len() - 1].center_m)
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

fn validate(contact: &SimulationContact) -> Result<(), String> {
    let setpoint = contact.number("temperatureC").ok_or_else(|| {
        format!(
            "{}: heat stimulus is missing a target temperature.",
            contact.label
        )
    })?;
    let duration = if contact.text("protocolMode", "constant") == "timeline" {
        let per_cycle = contact.number_or("timelineHoldS", 10.0).max(0.0)
            + contact.number_or("timelineRampS", 5.0).max(0.0)
            + contact.number_or("timelineReleaseS", 10.0).max(0.0);
        per_cycle * contact.number_or("timelineRepeats", 1.0).round().clamp(1.0, 1000.0)
    } else {
        contact
            .number("durationS")
            .ok_or_else(|| format!("{}: heat stimulus is missing a duration.", contact.label))?
    };

    if !(20.0..=150.0).contains(&setpoint) {
        return Err(format!(
            "{}: target temperature {:.1} °C is outside the supported 20–150 °C range.",
            contact.label, setpoint
        ));
    }
    let pre_exposure = contact.number_or("preExposureS", 0.0).max(0.0);
    let post_exposure = contact.number_or("postExposureS", 0.0).max(0.0);
    let total_s = pre_exposure + duration + post_exposure;
    if !(0.1..=7200.0).contains(&duration) {
        return Err(format!(
            "{}: active protocol duration {:.2} s is outside the supported 0.1–7200 s range.",
            contact.label, duration
        ));
    }
    if total_s > 7200.0 {
        return Err(format!(
            "{}: total protocol length {:.0} s exceeds the 7200 s limit.",
            contact.label, total_s
        ));
    }
    if contact.number_or("contactAreaMm2", 25.0) <= 0.0 {
        return Err(format!(
            "{}: contact area must be greater than zero.",
            contact.label
        ));
    }
    Ok(())
}

fn validate_electrical(contact: &SimulationContact) -> Result<(), String> {
    let duration = contact
        .number("durationS")
        .ok_or_else(|| format!("{}: electrical stimulus is missing a duration.", contact.label))?;
    if !(0.1..=3600.0).contains(&duration) {
        return Err(format!(
            "{}: duration {:.2} s is outside the supported 0.1–3600 s range.",
            contact.label, duration
        ));
    }
    if contact.number_or("contactAreaMm2", 400.0) <= 0.0 {
        return Err(format!("{}: electrode area must be positive.", contact.label));
    }
    let drive = contact.text("electricalDriveMode", "current");
    if drive == "voltage" {
        if contact.number_or("voltageV", 0.0) < 0.0 {
            return Err(format!("{}: voltage cannot be negative.", contact.label));
        }
    } else if contact.number_or("currentMa", 0.0) < 0.0 {
        return Err(format!("{}: current cannot be negative.", contact.label));
    }
    Ok(())
}

pub(crate) fn nerve_threshold_current_ma(pulse_duration_us: f64) -> f64 {
    const RHEOBASE_MA: f64 = 0.178;
    const CHRONAXIE_US: f64 = 270.0;
    RHEOBASE_MA * (1.0 + CHRONAXIE_US / pulse_duration_us.max(1.0))
}

fn electrical_report(
    contact: &SimulationContact,
    profile: &'static SkinProfile,
) -> Result<(ElectricalReport, Vec<f64>), String> {
    let area_m2 = contact.number_or("contactAreaMm2", 400.0).max(1.0) * 1.0e-6;
    let interface_impedance_ohm = contact.number_or("interfaceImpedanceOhm", 500.0).max(0.0);
    let drive_mode = contact.text("electricalDriveMode", "current");
    let waveform_type = contact.text("waveformType", "pulsed");
    let pulse_duration_us = contact.number_or("pulseDurationUs", 250.0).max(1.0);
    let frequency_hz = contact.number_or("frequencyHz", 50.0).max(0.01);
    let default_duty = (pulse_duration_us * frequency_hz / 1.0e6 * 100.0).clamp(0.01, 100.0);
    let duty_fraction = (contact.number_or("electricalDutyCycle", default_duty) / 100.0)
        .clamp(0.0001, 1.0);

    let tissue_areal_resistance: f64 = profile
        .layers
        .iter()
        .map(|layer| {
            layer.thickness_m.value
                / layer.electrical_conductivity_s_per_m.value.max(1.0e-10)
        })
        .sum();
    let tissue_resistance_ohm = tissue_areal_resistance / area_m2;
    let total_impedance_ohm = tissue_resistance_ohm + interface_impedance_ohm;
    let (peak_current_a, applied_voltage_v) = if drive_mode == "voltage" {
        let voltage = contact.number_or("voltageV", 10.0).max(0.0);
        (voltage / total_impedance_ohm.max(1.0e-9), voltage)
    } else {
        let current = contact.number_or("currentMa", 5.0).max(0.0) / 1000.0;
        (current, current * total_impedance_ohm)
    };
    let rms_factor = match waveform_type {
        "ac" => std::f64::consts::FRAC_1_SQRT_2,
        "pulsed" => duty_fraction.sqrt(),
        _ => 1.0,
    };
    let rms_current_a = peak_current_a * rms_factor;
    let peak_current_density = peak_current_a / area_m2;
    let rms_current_density = rms_current_a / area_m2;

    if !rms_current_density.is_finite() || rms_current_density > 1.0e7 {
        return Err(format!(
            "{}: resolved current density is outside the supported range; check current, voltage, electrode area and impedance.",
            contact.label
        ));
    }

    let mut depth_m = 0.0;
    let mut sources = Vec::with_capacity(profile.layers.len());
    let mut layers = Vec::with_capacity(profile.layers.len());
    for layer in profile.layers {
        let sigma = layer.electrical_conductivity_s_per_m.value.max(1.0e-10);
        let power_density = rms_current_density.powi(2) / sigma;
        let resistance = layer.thickness_m.value / (sigma * area_m2);
        let depth_end_m = depth_m + layer.thickness_m.value;
        sources.push(power_density);
        layers.push(ElectricalLayerResult {
            name: layer.name,
            depth_start_mm: depth_m * 1000.0,
            depth_end_mm: depth_end_m * 1000.0,
            conductivity_s_per_m: sigma,
            conductivity_confidence: layer.electrical_conductivity_s_per_m.review_status,
            current_density_a_per_m2: peak_current_density,
            power_density_w_per_m3: power_density,
            voltage_drop_v: peak_current_a * resistance,
        });
        depth_m = depth_end_m;
    }

    // Human in-vivo Aδ-fibre starting point. It came from an intraepidermal
    // electrode protocol, so surface-electrode use is explicitly extrapolated.
    let rheobase_ma = 0.178;
    let chronaxie_us = 270.0;
    let threshold_current_ma = nerve_threshold_current_ma(pulse_duration_us);
    let peak_current_ma = peak_current_a * 1000.0;
    let activation_margin = peak_current_ma / threshold_current_ma.max(1.0e-12);
    let classification = if activation_margin < 1.0 {
        "Sub-threshold"
    } else if activation_margin < 2.0 {
        "Perceptible"
    } else if activation_margin < 4.0 {
        "Motor stimulation"
    } else {
        "Painful"
    };
    let charge_per_pulse_uc = peak_current_ma * pulse_duration_us / 1000.0;
    let area_cm2 = area_m2 * 1.0e4;

    Ok((
        ElectricalReport {
            waveform_type: waveform_type.to_string(),
            drive_mode: drive_mode.to_string(),
            peak_current_ma,
            rms_current_ma: rms_current_a * 1000.0,
            applied_voltage_v,
            tissue_resistance_ohm,
            interface_impedance_ohm,
            total_impedance_ohm,
            current_density_a_per_m2: peak_current_density,
            total_power_w: rms_current_a.powi(2) * total_impedance_ohm,
            charge_per_pulse_uc,
            charge_density_uc_per_cm2: charge_per_pulse_uc / area_cm2.max(1.0e-12),
            layers,
            nerve_activation: NerveActivationResult {
                pulse_duration_us,
                applied_current_ma: peak_current_ma,
                threshold_current_ma,
                rheobase_ma,
                chronaxie_us,
                activation_margin,
                classification,
                confidence: "extrapolated",
                citation: "Kodama et al. Front Neurosci. 2020;14:588056 (human in-vivo Aδ-fibre strength-duration measurements).",
            },
            return_path_assumption: "Ideal remote return electrode; the 3D return-current path is not resolved.",
            confidence: "screening",
            citation: "IT'IS low-frequency conductivity database; Joule q = J²/σ; Weiss-Lapicque strength-duration law.",
        },
        sources,
    ))
}

fn perfusion_model_from_contact(contact: &SimulationContact) -> PerfusionModel {
    match contact.text("perfusionModel", "local-hyperemia") {
        "static" | "off" | "none" => PerfusionModel::Static,
        _ => PerfusionModel::LocalHyperemia {
            onset_c: contact.number_or("perfusionOnsetC", 33.0),
            half_max_c: contact.number_or("perfusionHalfMaxC", 39.0),
            max_fold: contact.number_or("perfusionMaxFold", 9.0).max(1.0),
            steepness_c: contact.number_or("perfusionSteepnessC", 1.2).max(0.05),
        },
    }
}

pub(crate) fn build_case(
    contact: &SimulationContact,
    profile: &'static SkinProfile,
    damage: &'static DamageModel,
    conductance: f64,
) -> HeatCase {
    let setpoint_c = contact.number_or("temperatureC", 44.0);
    let ambient_c = contact.number_or("ambientTemperatureC", 22.0);
    let device_thickness_m = contact.number_or("deviceThicknessMm", 2.0).max(0.01) / 1000.0;
    let control = contact.text("deviceControl", "ideal");
    let device_mat = device_material(contact.text("deviceMaterialId", DEFAULT_DEVICE_MATERIAL_ID))
        .unwrap_or_else(|| device_material(DEFAULT_DEVICE_MATERIAL_ID).unwrap());

    let areal_heat_capacity =
        device_mat.density_kg_per_m3 * device_mat.specific_heat_j_per_kg_k * device_thickness_m;

    let device = match control {
        "passive" => DeviceSpec::Dynamic(DeviceModel {
            setpoint_c,
            areal_heat_capacity_j_per_m2_k: areal_heat_capacity,
            control: DeviceControl::Passive,
            back_loss_w_per_m2_k: AMBIENT_COEFFICIENT_W_PER_M2_K,
            ambient_c,
        }),
        "regulated" => DeviceSpec::Dynamic(DeviceModel {
            setpoint_c,
            areal_heat_capacity_j_per_m2_k: areal_heat_capacity,
            control: DeviceControl::Regulated {
                gain_w_per_m2_k: contact.number_or("controllerGainWM2K", 2000.0).max(1.0),
                max_flux_w_per_m2: contact.number_or("controllerMaxFluxWM2", 5000.0).max(0.0),
            },
            back_loss_w_per_m2_k: AMBIENT_COEFFICIENT_W_PER_M2_K,
            ambient_c,
        }),
        _ => DeviceSpec::Ideal { setpoint_c },
    };

    let uses_thermal_timeline =
        contact.stimulus_type == "heat" && contact.text("protocolMode", "constant") == "timeline";
    let post_exposure_s = contact.number_or("postExposureS", 0.0).max(0.0);
    let (exposure_s, protocol_timeline) = if uses_thermal_timeline {
        let hold_s = contact.number_or("timelineHoldS", 10.0).max(0.0);
        let ramp_s = contact.number_or("timelineRampS", 5.0).max(0.0);
        let release_s = contact.number_or("timelineReleaseS", 10.0).max(0.0);
        let repeats = contact.number_or("timelineRepeats", 1.0).round().clamp(1.0, 1000.0) as usize;
        let ramp_target_c = contact.number_or("timelineRampTargetC", setpoint_c);
        let mut segments = Vec::with_capacity(repeats * 3 + usize::from(post_exposure_s > 0.0));
        for cycle in 0..repeats {
            if hold_s > 0.0 {
                segments.push(TimelineSegment {
                    kind: TimelineSegmentKind::Hold,
                    duration_s: hold_s,
                    repetitions: 1,
                    duty_cycle: None,
                    label: format!("Cycle {} hold", cycle + 1),
                    start_value: Some(setpoint_c),
                    end_value: Some(setpoint_c),
                    value_unit: Some("°C".to_string()),
                });
            }
            if ramp_s > 0.0 {
                segments.push(TimelineSegment {
                    kind: TimelineSegmentKind::Ramp,
                    duration_s: ramp_s,
                    repetitions: 1,
                    duty_cycle: None,
                    label: format!("Cycle {} ramp", cycle + 1),
                    start_value: Some(setpoint_c),
                    end_value: Some(ramp_target_c),
                    value_unit: Some("°C".to_string()),
                });
            }
            if release_s > 0.0 {
                segments.push(TimelineSegment {
                    kind: TimelineSegmentKind::Release,
                    duration_s: release_s,
                    repetitions: 1,
                    duty_cycle: None,
                    label: format!("Cycle {} release", cycle + 1),
                    start_value: Some(ramp_target_c),
                    end_value: Some(ambient_c),
                    value_unit: Some("°C".to_string()),
                });
            }
        }
        let exposure_s = segments.iter().map(|segment| segment.duration_s).sum();
        if post_exposure_s > 0.0 {
            segments.push(TimelineSegment::release(
                post_exposure_s,
                "Post-protocol cooling",
            ));
        }
        (exposure_s, ProtocolTimeline { segments })
    } else {
        let exposure_s = contact.number_or("durationS", 10.0);
        (
            exposure_s,
            ProtocolTimeline::exposure_and_cooling(exposure_s, post_exposure_s),
        )
    };
    let device = if uses_thermal_timeline {
        DeviceSpec::Ideal { setpoint_c }
    } else {
        device
    };

    HeatCase {
        layers: layers_from_profile(profile),
        exposure_source_w_per_m3: vec![0.0; profile.layers.len()],
        protocol_timeline,
        uses_thermal_timeline,
        blood: BloodProperties {
            temperature_c: profile.blood_c.value,
            density_kg_per_m3: profile.blood_density_kg_per_m3.value,
            specific_heat_j_per_kg_k: profile.blood_specific_heat_j_per_kg_k.value,
        },
        core_c: profile.core_c.value,
        baseline_skin_c: contact
            .number_or("baselineSkinTemperatureC", profile.baseline_skin_c.value),
        contact_conductance: conductance,
        device,
        pre_exposure_s: contact.number_or("preExposureS", 0.0).max(0.0),
        exposure_s,
        post_exposure_s,
        ambient_c,
        damage,
        basal_depth_m: profile.basal_depth_m(),
        dermal_base_depth_m: profile.dermal_base_depth_m(),
        perfusion_model: perfusion_model_from_contact(contact),
    }
}

/// One-at-a-time sensitivity over the properties with the widest ranges.
fn run_sensitivity(
    case: &HeatCase,
    settings: &SolverSettings,
    profile: &'static SkinProfile,
) -> Vec<SensitivityEntry> {
    let mut entries = Vec::new();

    let mut sweep = |parameter: String,
                     unit: &'static str,
                     baseline: f64,
                     low: f64,
                     high: f64,
                     apply: &dyn Fn(&mut HeatCase, f64)| {
        if (high - low).abs() < 1e-15 {
            return;
        }

        let mut low_case = case.clone();
        apply(&mut low_case, low);
        let low_out = solve_case(&low_case, settings, profile, false);

        let mut high_case = case.clone();
        apply(&mut high_case, high);
        let high_out = solve_case(&high_case, settings, profile, false);

        entries.push(SensitivityEntry {
            parameter,
            unit,
            baseline,
            low,
            high,
            peak_basal_low_c: low_out.peak_basal_c,
            peak_basal_high_c: high_out.peak_basal_c,
            omega_low: low_out.omega_basal,
            omega_high: high_out.omega_basal,
            peak_basal_span_c: (high_out.peak_basal_c - low_out.peak_basal_c).abs(),
        });
    };

    for (index, layer) in profile.layers.iter().enumerate().take(3) {
        let thickness = layer.thickness_m;
        sweep(
            format!("{} thickness", layer.name),
            "mm",
            thickness.value * 1000.0,
            thickness.low * 1000.0,
            thickness.high * 1000.0,
            &move |case: &mut HeatCase, value_mm: f64| {
                case.layers[index].thickness_m = value_mm / 1000.0;
                // Marker depths move with the layers they sit between.
                case.basal_depth_m = case.layers[0].thickness_m;
                case.dermal_base_depth_m = case.layers[0].thickness_m + case.layers[1].thickness_m;
            },
        );

        let conductivity = layer.conductivity_w_per_m_k;
        sweep(
            format!("{} conductivity", layer.name),
            "W/(m·K)",
            conductivity.value,
            conductivity.low,
            conductivity.high,
            &move |case: &mut HeatCase, value: f64| {
                case.layers[index].conductivity_w_per_m_k = value;
            },
        );

        let perfusion = layer.perfusion_per_s;
        sweep(
            format!("{} perfusion", layer.name),
            "1/s",
            perfusion.value,
            perfusion.low,
            perfusion.high,
            &move |case: &mut HeatCase, value: f64| {
                case.layers[index].perfusion_per_s = value;
            },
        );
    }

    // Contact conductance is the least certain input of all, so bracket it by
    // half and double rather than by a tabulated range.
    let nominal = case.contact_conductance;
    sweep(
        "Contact conductance".to_string(),
        "W/(m²·K)",
        nominal,
        nominal * 0.5,
        nominal * 2.0,
        &|case: &mut HeatCase, value: f64| {
            case.contact_conductance = value;
        },
    );

    entries.sort_by(|a, b| {
        b.peak_basal_span_c
            .partial_cmp(&a.peak_basal_span_c)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    entries
}

/// Re-run the case on systematically refined meshes and timesteps.
fn run_convergence(
    case: &HeatCase,
    settings: &SolverSettings,
    profile: &'static SkinProfile,
) -> ConvergenceReport {
    const RATIO: f64 = 2.0;

    let refine = |factor: f64| SolverSettings {
        surface_cell_um: settings.surface_cell_um / factor,
        max_cell_um: settings.max_cell_um / factor,
        growth_ratio: settings.growth_ratio,
        time_step_ms: settings.time_step_ms / factor,
        run_convergence_check: false,
        run_sensitivity: false,
    };

    let coarse = solve_case(case, &refine(0.5), profile, false);
    let medium = solve_case(case, settings, profile, false);
    let fine = solve_case(case, &refine(RATIO), profile, false);

    let metrics = vec![
        convergence_metric(
            "Peak basal temperature",
            "°C",
            coarse.peak_basal_c,
            medium.peak_basal_c,
            fine.peak_basal_c,
            RATIO,
            1e-4,
        ),
        convergence_metric(
            "Peak surface temperature",
            "°C",
            coarse.peak_surface_c,
            medium.peak_surface_c,
            fine.peak_surface_c,
            RATIO,
            1e-4,
        ),
        convergence_metric(
            "Damage integral Ω at basal layer",
            "-",
            coarse.omega_basal,
            medium.omega_basal,
            fine.omega_basal,
            RATIO,
            5e-2,
        ),
        convergence_metric(
            "Energy delivered at surface",
            "J/m²",
            coarse.energy.surface_in_j_per_m2,
            medium.energy.surface_in_j_per_m2,
            fine.energy.surface_in_j_per_m2,
            RATIO,
            1e-3,
        ),
    ];

    let converged = metrics.iter().all(|metric| metric.converged);
    let note = if converged {
        "Halving the cell size and timestep changes every tracked quantity by less than its tolerance, so the result is governed by the physics rather than the discretisation."
            .to_string()
    } else {
        "At least one quantity still moves when the mesh and timestep are refined. Reduce the surface cell size or timestep before relying on this result."
            .to_string()
    };

    ConvergenceReport {
        refinement_ratio: RATIO,
        metrics,
        converged,
        note,
    }
}

fn simulate_heat_contact(
    contact: &SimulationContact,
    settings: &SolverSettings,
) -> Result<ContactSimulationResult, String> {
    let is_electrical = contact.stimulus_type == "electrical";
    if is_electrical {
        validate_electrical(contact)?;
    } else {
        validate(contact)?;
    }

    let profile = skin_profile(contact.text("skinProfileId", DEFAULT_SKIN_PROFILE_ID))
        .unwrap_or_else(|| skin_profile(DEFAULT_SKIN_PROFILE_ID).unwrap());
    let damage = damage_model(contact.text("damageModelId", DEFAULT_DAMAGE_MODEL_ID))
        .unwrap_or_else(|| damage_model(DEFAULT_DAMAGE_MODEL_ID).unwrap());
    let device_mat = device_material(contact.text("deviceMaterialId", DEFAULT_DEVICE_MATERIAL_ID))
        .unwrap_or_else(|| device_material(DEFAULT_DEVICE_MATERIAL_ID).unwrap());
    let interface_mat =
        interface_material(contact.text("interfaceMaterialId", DEFAULT_INTERFACE_MATERIAL_ID))
            .unwrap_or_else(|| interface_material(DEFAULT_INTERFACE_MATERIAL_ID).unwrap());

    let contact_area_m2 = contact.number_or("contactAreaMm2", 25.0) * 1e-6;
    let pressure_pa = contact.number_or("contactPressureKpa", 5.0) * 1000.0;
    let interface_thickness_m = contact
        .number_or("interfaceThicknessUm", interface_mat.default_thickness_um)
        .max(0.1)
        * 1e-6;
    let override_conductance = contact
        .number("contactConductanceWM2K")
        .filter(|value| *value > 0.0);

    // Dermal conductivity governs both the constriction resistance and the
    // penetration depth used for the dimensionality check.
    let dermis = profile.layers.get(1).unwrap_or(&profile.layers[0]);
    let skin_conductivity = dermis.conductivity_w_per_m_k.value;
    let diffusivity = skin_conductivity
        / (dermis.density_kg_per_m3.value * dermis.specific_heat_j_per_kg_k.value);

    let network = contact_network(
        interface_mat,
        device_mat,
        skin_conductivity,
        interface_thickness_m,
        pressure_pa,
        override_conductance,
    );

    let electrical_and_sources = if is_electrical {
        Some(electrical_report(contact, profile)?)
    } else {
        None
    };
    let mut case = build_case(contact, profile, damage, network.total_w_per_m2_k);
    if let Some((_, sources)) = &electrical_and_sources {
        case.exposure_source_w_per_m3 = sources.clone();
        case.device = DeviceSpec::Ideal {
            setpoint_c: case.ambient_c,
        };
        case.contact_conductance = AMBIENT_COEFFICIENT_W_PER_M2_K;
    }

    let dimensionality = check_dimensionality(
        contact_area_m2,
        diffusivity,
        case.pre_exposure_s + case.exposure_s + case.post_exposure_s,
        case.basal_depth_m,
    );

    let dimension_requested = contact.text("solverDimension", "auto");
    let dimension = resolve_solver_dimension(dimension_requested, &dimensionality);
    let output = solve_heat_case(
        &case,
        settings,
        profile,
        contact_area_m2,
        dimension,
        true,
    );

    let lateral = if dimension == SolverDimension::OneD {
        lateral_bound(
            &output.series,
            case.basal_depth_m,
            diffusivity,
            contact_area_m2,
            damage,
        )
    } else {
        (
            output.peak_basal_c,
            output.omega_basal,
        )
    };

    let sensitivity = if settings.run_sensitivity && !is_electrical {
        run_sensitivity(&case, settings, profile)
    } else {
        Vec::new()
    };

    let (sensitivity_low, sensitivity_high) = sensitivity.iter().fold(
        (output.peak_basal_c, output.peak_basal_c),
        |(low, high), entry| {
            (
                low.min(entry.peak_basal_low_c).min(entry.peak_basal_high_c),
                high.max(entry.peak_basal_low_c)
                    .max(entry.peak_basal_high_c),
            )
        },
    );

    let convergence = if settings.run_convergence_check {
        Some(run_convergence(&case, settings, profile))
    } else {
        None
    };

    let control_label: &'static str = if is_electrical {
        "internal Joule heating"
    } else {
        match case.device {
        DeviceSpec::Ideal { .. } => "ideal (setpoint held)",
        DeviceSpec::Dynamic(DeviceModel {
            control: DeviceControl::Passive,
            ..
        }) => "passive thermal mass",
        DeviceSpec::Dynamic(_) => "regulated, power-limited",
        }
    };

    let mut warnings = collect_warnings(
        contact,
        profile,
        damage,
        &network,
        &dimensionality,
        &output,
        convergence.as_ref(),
        &case,
        override_conductance.is_some(),
    );

    if dimension == SolverDimension::Axisymmetric && dimension_requested == "auto" {
        warnings.insert(
            0,
            format!(
                "Auto-selected axisymmetric r–z solver (Fo = {:.2}) to resolve lateral heat spreading.",
                dimensionality.fourier_number
            ),
        );
    } else if dimension == SolverDimension::Axisymmetric && dimension_requested != "auto" {
        warnings.insert(
            0,
            format!(
                "Using axisymmetric r–z solver (Fo = {:.2}).",
                dimensionality.fourier_number
            ),
        );
    }
    if let Some((report, _)) = &electrical_and_sources {
        warnings.insert(
            0,
            format!(
                "Electrical screening uses a layered 1-D current path with an ideal remote return electrode; thermal spreading is {}. Conductivity confidence is not patient-specific.",
                if dimension == SolverDimension::Axisymmetric {
                    "axisymmetrically corrected"
                } else {
                    "depth-only"
                }
            ),
        );
        if report.nerve_activation.confidence == "extrapolated" {
            warnings.push(
                "Nerve activation uses human Aδ-fibre strength-duration data measured with an intraepidermal electrode; applying it to a surface electrode is extrapolated."
                    .to_string(),
            );
        }
    }

    let device_areal_heat_capacity = match case.device {
        DeviceSpec::Ideal { .. } => None,
        DeviceSpec::Dynamic(device) => Some(device.areal_heat_capacity_j_per_m2_k),
    };
    let cem43_basal_minutes = cem43_minutes(&output.series);
    // 240 CEM43 is a commonly reported hyperthermia tissue-effect reference,
    // not a universal human-skin injury boundary. We expose disagreement
    // rather than collapsing CEM43 and Arrhenius Ω into one verdict.
    let cem43_reference_minutes = 240.0;
    let omega_flags = output.omega_basal >= 1.0;
    let cem43_flags = cem43_basal_minutes >= cem43_reference_minutes;
    let thermal_dose_disagreement = omega_flags != cem43_flags;

    Ok(ContactSimulationResult {
        contact_point_id: contact.id.clone(),
        label: contact.label.clone(),
        inputs: ResolvedInputs {
            device_setpoint_c: if is_electrical {
                case.ambient_c
            } else {
                contact.number_or("temperatureC", 44.0)
            },
            pre_exposure_s: case.pre_exposure_s,
            exposure_s: case.exposure_s,
            post_exposure_s: case.post_exposure_s,
            contact_area_mm2: contact_area_m2 * 1e6,
            device_thickness_mm: contact.number_or("deviceThicknessMm", 2.0),
            contact_pressure_kpa: pressure_pa / 1000.0,
            interface_thickness_um: interface_thickness_m * 1e6,
            ambient_temperature_c: case.ambient_c,
            baseline_skin_temperature_c: case.baseline_skin_c,
            device_control: control_label,
            device_areal_heat_capacity_j_per_m2_k: device_areal_heat_capacity,
            contact_conductance_w_per_m2_k: network.total_w_per_m2_k,
        },
        protocol_timeline: case.protocol_timeline.clone(),
        skin_profile: profile,
        device_material: device_mat,
        interface_material: interface_mat,
        damage_model: damage,
        summary: ResultSummary {
            peak_surface_temperature_c: output.peak_surface_c,
            peak_basal_temperature_c: output.peak_basal_c,
            peak_dermal_base_temperature_c: output.peak_dermal_base_c,
            final_surface_temperature_c: output.final_surface_c,
            final_device_temperature_c: output.final_device_c,
            time_to_44c_s: output.time_to_44c_s,
            basal_depth_mm: case.basal_depth_m * 1000.0,
            dermal_base_depth_mm: case.dermal_base_depth_m * 1000.0,
            omega_basal: output.omega_basal,
            omega_dermal_base: output.omega_dermal_base,
            cem43_basal_minutes,
            cem43_reference_minutes,
            thermal_dose_disagreement,
            comfort_classification: comfort_classification(output.peak_surface_c),
            damage_depth_mm: output.damage_depth_m.map(|depth| depth * 1000.0),
            risk_classification: burn_classification(output.omega_basal, output.omega_dermal_base),
            peak_surface_flux_w_per_m2: output.peak_surface_flux,
            total_energy_delivered_j: electrical_and_sources
                .as_ref()
                .map(|(report, _)| report.total_power_w * case.exposure_s)
                .unwrap_or(output.energy.surface_in_j_per_m2 * contact_area_m2),
        },
        contact: network,
        dimensionality,
        series: output.series,
        depth_profile: output.depth_profile,
        energy: output.energy,
        bounds: ResultBounds {
            nominal_peak_basal_c: output.peak_basal_c,
            lateral_bound_peak_basal_c: lateral.0,
            lateral_bound_omega: lateral.1,
            sensitivity_low_peak_basal_c: sensitivity_low,
            sensitivity_high_peak_basal_c: sensitivity_high,
            note: if dimension == SolverDimension::Axisymmetric {
                "Axisymmetric r–z solve resolves lateral heat spreading for this contact size. The sensitivity envelope is the widest excursion from varying one tissue property at a time across its tabulated range."
            } else {
                "The lateral bound scales the temperature rise by the analytic disc-source factor for a contact of this size, estimating the sideways heat loss a 1D model cannot represent. The sensitivity envelope is the widest excursion from varying one tissue property at a time across its tabulated range."
            },
        },
        sensitivity,
        convergence,
        solver: ResolvedSolverSettings {
            surface_cell_um: settings.surface_cell_um,
            max_cell_um: settings.max_cell_um,
            growth_ratio: settings.growth_ratio,
            time_step_ms: settings.time_step_ms,
            scheme: if dimension == SolverDimension::Axisymmetric {
                "Axisymmetric disc correction: 1-D Pennes + analytic radial spreading factor"
            } else {
                "Finite volume, Crank–Nicolson, harmonic-mean interface conductivity"
            },
            cell_count: output.cell_count,
            step_count: output.step_count,
            domain_depth_mm: output.domain_depth_m * 1000.0,
            solver_dimension: dimension.label(),
            solver_dimension_requested: requested_dimension_label(dimension_requested),
            radial_cell_count: if dimension == SolverDimension::Axisymmetric {
                Some(16)
            } else {
                None
            },
            radial_domain_mm: if dimension == SolverDimension::Axisymmetric {
                Some((4.0 * contact::contact_radius_m(contact_area_m2)).max(0.025) * 1000.0)
            } else {
                None
            },
        },
        warnings,
        radial_profile: output.radial_profile,
        electrical: electrical_and_sources.map(|(report, _)| report),
    })
}

#[allow(clippy::too_many_arguments)]
fn collect_warnings(
    contact: &SimulationContact,
    profile: &SkinProfile,
    damage: &DamageModel,
    network: &ContactNetwork,
    dimensionality: &DimensionalityCheck,
    output: &CaseOutput,
    convergence: Option<&ConvergenceReport>,
    case: &HeatCase,
    conductance_overridden: bool,
) -> Vec<String> {
    let mut warnings = Vec::new();

    if !matches!(dimensionality.verdict, "1D assumption well satisfied") {
        warnings.push(format!(
            "{} (Fo = {:.2}). {}",
            dimensionality.verdict, dimensionality.fourier_number, dimensionality.guidance
        ));
    }

    if matches!(case.device, DeviceSpec::Ideal { .. }) {
        warnings.push(
            "Device is modelled as holding its setpoint exactly, which assumes a controller with unlimited power. Switch to a passive or regulated device to see how a real thermal mass behaves."
                .to_string(),
        );
    }

    if !conductance_overridden {
        warnings.push(
            "Contact conductance was estimated from the interface material and pressure, not measured. It is the single largest source of uncertainty in this result."
                .to_string(),
        );
    }

    if let Some(report) = convergence {
        if !report.converged {
            warnings.push(format!(
                "Numerical convergence not demonstrated. {}",
                report.note
            ));
        }
    }

    if !output.energy.balanced {
        warnings.push(format!(
            "Energy ledger did not close: relative residual {:.2e}. Treat the result as suspect.",
            output.energy.relative_residual
        ));
    }

    if case.post_exposure_s <= 0.0 && output.peak_basal_c > damage.threshold_c {
        warnings.push(
            "Tissue is still above the damage threshold when the run ends. Add a post-exposure window so Ω captures the cooling tail; otherwise the damage integral is under-reported."
                .to_string(),
        );
    }

    if contact.number_or("temperatureC", 44.0) > 100.0 {
        warnings.push(
            "Above 100 °C, water vaporisation and tissue ablation dominate and are not modelled here."
                .to_string(),
        );
    }

    warnings.push(format!(
        "Tissue properties come from the '{}' profile, whose values are {}.",
        profile.label, profile.review_status
    ));
    warnings.push(format!("Damage kinetics: {}", damage.review_status));

    for note in &network.notes {
        warnings.push(note.clone());
    }

    warnings
}

pub fn run_heat_simulation(request: SimulationRequest) -> Result<SimulationResponse, String> {
    let mut contacts = Vec::new();
    let mut unsupported_contacts = Vec::new();

    for contact in &request.contacts {
        if contact.stimulus_type == "heat" || contact.stimulus_type == "electrical" {
            contacts.push(simulate_heat_contact(contact, &request.settings)?);
        } else {
            unsupported_contacts.push(UnsupportedContact {
                contact_point_id: contact.id.clone(),
                label: contact.label.clone(),
                stimulus_type: contact.stimulus_type.clone(),
                reason:
                    "This solver handles heat and electrical-thermal contacts. Pressure uses the mechanical solver; cold is not implemented.",
            });
        }
    }

    let generated_at_unix_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0);

    Ok(SimulationResponse {
        model: ModelMetadata {
            name: "Layered Pennes bioheat with thermal-contact and electrical Joule sources",
            version: MODEL_VERSION,
            scope:
                "Heat and electrical-thermal contacts. Sites are independent; electrical current follows a layered 1-D path with an ideal remote return, while thermal spreading can use 1-D or an axisymmetric disc correction.",
            governing_equations: &[
                "ρc ∂T/∂t = ∂/∂x(k ∂T/∂x) + ω_b ρ_b c_b (T_a − T) + q_met",
                "q_surface = h_contact (T_device − T_skin)",
                "q_electrical = J²/σ during stimulation",
                "Ω(t) = ∫ A exp(−E_a / R T) dt, integrated above the threshold temperature",
                "I_threshold = I_rheobase (1 + chronaxie / pulse_duration)",
            ],
            numerics:
                "Finite-volume discretisation on a graded mesh with harmonic-mean interface conductivity, advanced by Crank–Nicolson with a damped startup and solved with the Thomas algorithm.",
            citations: &[
                "Pennes HH (1948). Analysis of tissue and arterial blood temperatures in the resting human forearm. J Appl Physiol 1(2):93-122.",
                "Henriques FC (1947). Studies of thermal injury V. Arch Pathol 43:489-502.",
                "Carslaw HS & Jaeger JC (1959). Conduction of Heat in Solids, 2nd ed. Oxford.",
                "Patankar SV (1980). Numerical Heat Transfer and Fluid Flow. Hemisphere.",
                "IT'IS Foundation Tissue Properties Database: low-frequency electrical conductivity.",
                "Kodama et al. (2020). Electrical characterisation of Aδ-fibres based on human in-vivo electrostimulation threshold. Front Neurosci 14:588056.",
            ],
            disclaimer:
                "Research prototype. Not clinically validated, not patient-specific, and not medical advice.",
            validation_status:
                "Thermal numerics are verified against analytic solutions and conservation checks. Electrical coupling is verified computationally but not yet experimentally validated; no electrical accuracy claim is made.",
        },
        manifest: RunManifest {
            model_version: MODEL_VERSION,
            generated_at_unix_ms,
            contact_count: contacts.len(),
            verification: verification::run_verification_suite(),
        },
        contacts,
        unsupported_contacts,
    })
}

pub fn run_verification() -> VerificationSuite {
    verification::run_verification_suite()
}

pub use validation::{run_validation_suite, ValidationRequest, ValidationSuiteReport};

#[cfg(test)]
mod tests {
    use super::*;

    fn heat_contact(parameters: &[(&str, f64)], options: &[(&str, &str)]) -> SimulationContact {
        SimulationContact {
            id: "cp-1".to_string(),
            label: "CP-1".to_string(),
            stimulus_type: "heat".to_string(),
            parameters: parameters
                .iter()
                .map(|(key, value)| (key.to_string(), *value))
                .collect(),
            options: options
                .iter()
                .map(|(key, value)| (key.to_string(), value.to_string()))
                .collect(),
        }
    }

    fn fast_settings() -> SolverSettings {
        SolverSettings {
            run_convergence_check: false,
            run_sensitivity: false,
            ..SolverSettings::default()
        }
    }

    #[test]
    fn contact_heat_elevates_basal_temperature() {
        let contact = heat_contact(&[("temperatureC", 60.0), ("durationS", 10.0)], &[]);
        let result = simulate_heat_contact(&contact, &fast_settings()).expect("valid input");

        assert!(
            result.summary.peak_basal_temperature_c > result.inputs.baseline_skin_temperature_c
        );
        assert!(!result.series.is_empty());
        assert!(result.energy.balanced);
    }

    #[test]
    fn finite_contact_conductance_keeps_skin_below_the_device() {
        // The whole point of replacing the fixed-temperature boundary: skin
        // must not instantly reach the device setpoint.
        let contact = heat_contact(
            &[
                ("temperatureC", 70.0),
                ("durationS", 5.0),
                ("contactPressureKpa", 2.0),
            ],
            &[("interfaceMaterialId", "dry-contact")],
        );
        let result = simulate_heat_contact(&contact, &fast_settings()).expect("valid input");

        assert!(
            result.summary.peak_surface_temperature_c < 70.0,
            "surface reached {:.2} °C, which implies a perfect-contact boundary",
            result.summary.peak_surface_temperature_c
        );
    }

    #[test]
    fn better_interface_transfers_more_heat() {
        let dry = heat_contact(
            &[("temperatureC", 60.0), ("durationS", 10.0)],
            &[("interfaceMaterialId", "dry-contact")],
        );
        let gel = heat_contact(
            &[("temperatureC", 60.0), ("durationS", 10.0)],
            &[("interfaceMaterialId", "hydrogel")],
        );

        let dry = simulate_heat_contact(&dry, &fast_settings()).unwrap();
        let gel = simulate_heat_contact(&gel, &fast_settings()).unwrap();

        assert!(gel.summary.peak_basal_temperature_c > dry.summary.peak_basal_temperature_c);
    }

    #[test]
    fn passive_device_cools_while_an_ideal_one_does_not() {
        let parameters = [
            ("temperatureC", 60.0),
            ("durationS", 20.0),
            ("deviceThicknessMm", 0.5),
        ];
        let ideal = heat_contact(&parameters, &[("deviceControl", "ideal")]);
        let passive = heat_contact(&parameters, &[("deviceControl", "passive")]);

        let ideal = simulate_heat_contact(&ideal, &fast_settings()).unwrap();
        let passive = simulate_heat_contact(&passive, &fast_settings()).unwrap();

        assert!((ideal.summary.final_device_temperature_c - 60.0).abs() < 1e-9);
        assert!(passive.summary.final_device_temperature_c < 60.0);
        assert!(passive.summary.peak_basal_temperature_c < ideal.summary.peak_basal_temperature_c);
    }

    #[test]
    fn thicker_epidermis_shields_the_basal_layer() {
        let parameters = [("temperatureC", 60.0), ("durationS", 10.0)];
        let forearm = heat_contact(&parameters, &[("skinProfileId", "volar-forearm")]);
        let palm = heat_contact(&parameters, &[("skinProfileId", "palm")]);

        let forearm = simulate_heat_contact(&forearm, &fast_settings()).unwrap();
        let palm = simulate_heat_contact(&palm, &fast_settings()).unwrap();

        assert!(palm.summary.peak_basal_temperature_c < forearm.summary.peak_basal_temperature_c);
    }

    #[test]
    fn organic_tissue_profiles_resolve_and_simulate() {
        // Every non-skin tissue must be a well-formed layered stack that runs
        // through the same solver without producing non-finite results.
        for id in [
            "cortical-bone",
            "scalp-hair",
            "articular-cartilage",
            "cell-membrane",
        ] {
            let profile = skin_profile(id).unwrap_or_else(|| panic!("missing profile {id}"));
            assert!(!profile.layers.is_empty(), "{id} has no layers");
            assert!(
                !profile.shallow_marker_label.is_empty(),
                "{id} shallow label"
            );
            assert!(!profile.deep_marker_label.is_empty(), "{id} deep label");
            assert!(!profile.citations.is_empty(), "{id} citations");

            for layer in profile.layers {
                assert!(layer.thickness_m.value > 0.0, "{id} layer thickness");
                assert!(
                    layer.conductivity_w_per_m_k.value > 0.0,
                    "{id} conductivity"
                );
                assert!(layer.density_kg_per_m3.value > 0.0, "{id} density");
                assert!(
                    layer.specific_heat_j_per_kg_k.value > 0.0,
                    "{id} specific heat"
                );
                assert!(layer.perfusion_per_s.value >= 0.0, "{id} perfusion");
            }

            let contact = heat_contact(
                &[("temperatureC", 55.0), ("durationS", 10.0)],
                &[("skinProfileId", id)],
            );
            let result = simulate_heat_contact(&contact, &fast_settings())
                .unwrap_or_else(|e| panic!("{id} failed to simulate: {e}"));

            assert!(
                result.summary.peak_surface_temperature_c.is_finite(),
                "{id} non-finite surface temperature"
            );
            assert!(
                result.summary.peak_basal_temperature_c
                    >= result.inputs.baseline_skin_temperature_c - 1.0,
                "{id} basal temperature below baseline"
            );
            assert!(result.energy.balanced, "{id} energy ledger did not close");
        }
    }

    #[test]
    fn bone_conducts_heat_deeper_than_insulating_hair() {
        // Bone (k ~ 0.3) with almost no perfusion should let the deep marker
        // heat more than the air-filled hair canopy does for the same contact.
        let parameters = [("temperatureC", 60.0), ("durationS", 30.0)];
        let bone = simulate_heat_contact(
            &heat_contact(&parameters, &[("skinProfileId", "cortical-bone")]),
            &fast_settings(),
        )
        .unwrap();
        let scalp = simulate_heat_contact(
            &heat_contact(&parameters, &[("skinProfileId", "scalp-hair")]),
            &fast_settings(),
        )
        .unwrap();

        assert!(
            scalp.summary.peak_surface_temperature_c > bone.summary.peak_surface_temperature_c,
            "the insulating hair canopy should run a hotter surface than bare-boned skin"
        );
    }

    #[test]
    fn post_exposure_window_increases_the_damage_integral() {
        let base = [("temperatureC", 70.0), ("durationS", 15.0)];
        let options = [("interfaceMaterialId", "hydrogel")];

        let without =
            simulate_heat_contact(&heat_contact(&base, &options), &fast_settings()).unwrap();
        let with = simulate_heat_contact(
            &heat_contact(
                &[
                    ("temperatureC", 70.0),
                    ("durationS", 15.0),
                    ("postExposureS", 30.0),
                ],
                &options,
            ),
            &fast_settings(),
        )
        .unwrap();

        assert!(with.summary.omega_basal > without.summary.omega_basal);
    }

    #[test]
    fn contact_area_changes_the_lateral_bound() {
        let small = heat_contact(
            &[
                ("temperatureC", 60.0),
                ("durationS", 30.0),
                ("contactAreaMm2", 1.0),
            ],
            &[("solverDimension", "1d")],
        );
        let large = heat_contact(
            &[
                ("temperatureC", 60.0),
                ("durationS", 30.0),
                ("contactAreaMm2", 2500.0),
            ],
            &[("solverDimension", "1d")],
        );

        let small = simulate_heat_contact(&small, &fast_settings()).unwrap();
        let large = simulate_heat_contact(&large, &fast_settings()).unwrap();

        assert_eq!(small.dimensionality.verdict, "1D assumption not valid");
        assert_eq!(large.dimensionality.verdict, "1D assumption well satisfied");

        // A small patch loses far more to lateral spreading, so its bound sits
        // much further below the nominal 1D answer.
        let small_gap = small.bounds.nominal_peak_basal_c - small.bounds.lateral_bound_peak_basal_c;
        let large_gap = large.bounds.nominal_peak_basal_c - large.bounds.lateral_bound_peak_basal_c;
        assert!(small_gap > large_gap);
    }

    #[test]
    fn solution_is_mesh_and_timestep_converged() {
        let contact = heat_contact(&[("temperatureC", 65.0), ("durationS", 10.0)], &[]);
        let settings = SolverSettings {
            run_sensitivity: false,
            ..SolverSettings::default()
        };
        let result = simulate_heat_contact(&contact, &settings).unwrap();

        let report = result.convergence.expect("convergence check requested");
        for metric in &report.metrics {
            assert!(
                metric.converged,
                "'{}' changed by {:.3e} on refinement, tolerance {:.3e}",
                metric.name, metric.relative_change, metric.tolerance
            );
            // Where the three grids differ enough for Richardson to be
            // meaningful, the scheme should show close to second-order
            // behaviour. Grading the mesh costs a little formal order.
            if let Some(order) = metric.observed_order {
                assert!(
                    order > 1.5,
                    "'{}' converged at only order {order:.2}",
                    metric.name
                );
            }
        }
    }

    /// Prints headline numbers for representative scenarios so the model can be
    /// eyeballed for plausibility. Ignored by default.
    #[test]
    #[ignore]
    fn print_scenario_summaries() {
        let scenarios: Vec<(&str, Vec<(&str, f64)>, Vec<(&str, &str)>)> = vec![
            (
                "Wearable band 43C / 30 min / silicone pad",
                vec![
                    ("temperatureC", 43.0),
                    ("durationS", 1800.0),
                    ("postExposureS", 300.0),
                    ("contactAreaMm2", 400.0),
                    ("interfaceThicknessUm", 500.0),
                    ("deviceThicknessMm", 3.0),
                ],
                vec![
                    ("skinProfileId", "volar-forearm"),
                    ("interfaceMaterialId", "silicone-pad"),
                    ("deviceControl", "regulated"),
                ],
            ),
            (
                "Handheld 48C / 60 s / dry palm grip",
                vec![
                    ("temperatureC", 48.0),
                    ("durationS", 60.0),
                    ("postExposureS", 120.0),
                    ("contactAreaMm2", 1200.0),
                    ("interfaceThicknessUm", 15.0),
                    ("contactPressureKpa", 15.0),
                    ("deviceThicknessMm", 2.0),
                ],
                vec![
                    ("skinProfileId", "palm"),
                    ("interfaceMaterialId", "dry-contact"),
                    ("deviceControl", "passive"),
                ],
            ),
            (
                "Therapy pad 45C / 10 min / hydrogel",
                vec![
                    ("temperatureC", 45.0),
                    ("durationS", 600.0),
                    ("postExposureS", 300.0),
                    ("contactAreaMm2", 5000.0),
                    ("interfaceThicknessUm", 250.0),
                ],
                vec![
                    ("skinProfileId", "upper-back"),
                    ("interfaceMaterialId", "hydrogel"),
                    ("deviceControl", "regulated"),
                ],
            ),
            (
                "Hot surface 70C / 1 s / fingertip",
                vec![
                    ("temperatureC", 70.0),
                    ("durationS", 1.0),
                    ("postExposureS", 30.0),
                    ("contactAreaMm2", 100.0),
                    ("interfaceThicknessUm", 15.0),
                    ("contactPressureKpa", 20.0),
                    ("deviceThicknessMm", 10.0),
                ],
                vec![
                    ("skinProfileId", "fingertip"),
                    ("deviceMaterialId", "stainless-316"),
                    ("interfaceMaterialId", "dry-contact"),
                    ("deviceControl", "passive"),
                ],
            ),
            (
                "Threshold probe 55C / 30 s / forearm",
                vec![
                    ("temperatureC", 55.0),
                    ("durationS", 30.0),
                    ("postExposureS", 180.0),
                    ("contactAreaMm2", 500.0),
                    ("interfaceThicknessUm", 100.0),
                ],
                vec![
                    ("skinProfileId", "volar-forearm"),
                    ("interfaceMaterialId", "hydrogel"),
                    ("deviceControl", "ideal"),
                ],
            ),
        ];

        println!(
            "\n{:<42} {:>8} {:>8} {:>8} {:>9} {:>11} {:>10}",
            "scenario", "h", "Tsurf", "Tbasal", "t44", "omega", "1D"
        );
        for (name, parameters, options) in scenarios {
            let contact = heat_contact(&parameters, &options);
            let result = simulate_heat_contact(&contact, &fast_settings()).unwrap();
            println!(
                "{:<42} {:>8.0} {:>8.2} {:>8.2} {:>9} {:>11} {:>10.3}",
                name,
                result.inputs.contact_conductance_w_per_m2_k,
                result.summary.peak_surface_temperature_c,
                result.summary.peak_basal_temperature_c,
                result
                    .summary
                    .time_to_44c_s
                    .map(|v| format!("{v:.2}"))
                    .unwrap_or_else(|| "-".to_string()),
                format!("{:.3e}", result.summary.omega_basal),
                result.dimensionality.spreading_factor,
            );
        }
        println!();
    }

    /// Writes the serialised response to disk so the TypeScript types can be
    /// checked against the real payload. Ignored by default.
    #[test]
    #[ignore]
    fn dump_response_schema() {
        let response = run_heat_simulation(SimulationRequest {
            contacts: vec![heat_contact(
                &[
                    ("temperatureC", 60.0),
                    ("durationS", 2.0),
                    ("postExposureS", 1.0),
                ],
                &[("deviceControl", "passive")],
            )],
            settings: SolverSettings::default(),
        })
        .unwrap();

        let json = serde_json::to_string_pretty(&response).unwrap();
        std::fs::write("../dev/simulation-response.json", json).unwrap();
    }

    #[test]
    fn unsupported_stimuli_are_reported_not_simulated() {
        let response = run_heat_simulation(SimulationRequest {
            contacts: vec![SimulationContact {
                id: "cp-cold".to_string(),
                label: "CP-cold".to_string(),
                stimulus_type: "cold".to_string(),
                parameters: HashMap::new(),
                options: HashMap::new(),
            }],
            settings: fast_settings(),
        })
        .expect("request is valid");

        assert!(response.contacts.is_empty());
        assert_eq!(response.unsupported_contacts.len(), 1);
    }

    #[test]
    fn invalid_inputs_are_rejected_with_a_useful_message() {
        let contact = heat_contact(&[("temperatureC", 500.0), ("durationS", 10.0)], &[]);
        let error = simulate_heat_contact(&contact, &fast_settings()).unwrap_err();
        assert!(error.contains("outside the supported"));
    }

    #[test]
    fn cem43_is_one_minute_for_one_minute_at_43c() {
        let sample = |time_s| ThermalSample {
            time_s,
            surface_temperature_c: 43.0,
            basal_temperature_c: 43.0,
            dermal_base_temperature_c: 43.0,
            device_temperature_c: 43.0,
            damage_omega: 0.0,
            surface_flux_w_per_m2: 0.0,
            phase: "exposure",
        };
        assert!((cem43_minutes(&[sample(0.0), sample(60.0)]) - 1.0).abs() < 1.0e-12);
    }

    #[test]
    fn repeated_thermal_timeline_is_executed_as_real_segments() {
        let contact = heat_contact(
            &[
                ("temperatureC", 42.0),
                ("timelineHoldS", 2.0),
                ("timelineRampTargetC", 48.0),
                ("timelineRampS", 2.0),
                ("timelineReleaseS", 2.0),
                ("timelineRepeats", 2.0),
                ("contactAreaMm2", 400.0),
            ],
            &[("protocolMode", "timeline"), ("solverDimension", "1d")],
        );
        let result = simulate_heat_contact(&contact, &fast_settings()).expect("timeline result");
        assert_eq!(result.protocol_timeline.segments.len(), 6);
        assert!(result.series.iter().any(|sample| sample.phase == "ramp"));
        assert!(result.series.iter().any(|sample| sample.phase == "release"));
        assert!(result.summary.cem43_basal_minutes.is_finite());
    }

    #[test]
    fn electrical_current_generates_joule_heat_and_activation_result() {
        let contact = SimulationContact {
            id: "cp-electrical".to_string(),
            label: "Electrical contact".to_string(),
            stimulus_type: "electrical".to_string(),
            parameters: [
                ("currentMa", 5.0),
                ("pulseDurationUs", 250.0),
                ("frequencyHz", 50.0),
                ("electricalDutyCycle", 1.25),
                ("durationS", 10.0),
                ("postExposureS", 5.0),
                ("contactAreaMm2", 400.0),
                ("interfaceImpedanceOhm", 500.0),
            ]
            .into_iter()
            .map(|(key, value)| (key.to_string(), value))
            .collect(),
            options: [
                ("waveformType", "pulsed"),
                ("electricalDriveMode", "current"),
                ("skinProfileId", "volar-forearm"),
                ("solverDimension", "1d"),
            ]
            .into_iter()
            .map(|(key, value)| (key.to_string(), value.to_string()))
            .collect(),
        };
        let result = simulate_heat_contact(&contact, &fast_settings()).expect("electrical result");
        let electrical = result.electrical.expect("electrical report");
        assert!(electrical.total_power_w > 0.0);
        assert!(electrical.layers.iter().all(|layer| layer.power_density_w_per_m3 > 0.0));
        assert!(electrical.nerve_activation.activation_margin > 1.0);
        assert!(result.summary.peak_basal_temperature_c.is_finite());
    }
}
