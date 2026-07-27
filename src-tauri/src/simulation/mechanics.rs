//! Mechanical contact simulation: how a device pressing on tissue deforms it,
//! and — for bone under repeated load — how it fatigues and changes shape.
//!
//! Scope: a one-dimensional layered response, mirroring the thermal solver's
//! layered stack. Under a normal contact pressure the same stress is carried
//! through the depth (series equilibrium) and each layer responds as a linear
//! Kelvin–Voigt viscoelastic solid, so the model produces creep during loading,
//! recovery after release, permanent set once a layer yields, and cyclic
//! fatigue for bone. It is a research screening model, not a validated FEA
//! substitute: it ignores lateral spreading, shear and large-deformation
//! geometry, and every material constant is a representative literature value.
//!
//! Key references:
//! - Agache PG et al. (1980). Mechanical properties and Young's modulus of human
//!   skin in vivo. Arch Dermatol Res 269:221-232.
//! - Reilly DT, Burstein AH (1975). The elastic and ultimate properties of
//!   compact bone tissue. J Biomech 8(6):393-405.
//! - Carter DR, Caler WE (1981/1985). Cortical bone fatigue and a cumulative
//!   damage model for bone fracture. Acta Orthop 52:481-490; J Orthop Res 3:84-90.
//! - Pattin CA, Caler WE, Carter DR (1996). Cyclic mechanical property
//!   degradation during fatigue loading of cortical bone. J Biomech 29(1):69-79.

use serde::Serialize;

use super::model::{skin_profile, SkinProfile, DEFAULT_SKIN_PROFILE_ID};
use super::{SimulationContact, SimulationRequest};

pub const MECH_MODEL_VERSION: &str = "vide-mech-1d-viscoelastic-fatigue/0.2.0";

/// Broad mechanical family a tissue layer belongs to.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum MechClass {
    Skin,
    Fat,
    Muscle,
    Cartilage,
    CorticalBone,
    TrabecularBone,
    Marrow,
    Aqueous,
}

impl MechClass {
    fn label(self) -> &'static str {
        match self {
            MechClass::Skin => "Skin",
            MechClass::Fat => "Fat / adipose",
            MechClass::Muscle => "Muscle",
            MechClass::Cartilage => "Cartilage",
            MechClass::CorticalBone => "Cortical bone",
            MechClass::TrabecularBone => "Trabecular bone",
            MechClass::Marrow => "Marrow",
            MechClass::Aqueous => "Aqueous / gel",
        }
    }
}

/// Representative mechanical constants for a tissue class.
#[derive(Debug, Clone, Copy)]
struct MechProps {
    /// Effective compressive Young's modulus (Pa).
    youngs_modulus_pa: f64,
    /// Kelvin–Voigt retardation time (s): how quickly creep develops.
    retardation_tau_s: f64,
    /// Strain beyond which deformation is taken as partly permanent.
    yield_strain: f64,
    /// Strain at which the tissue is flagged as failed/ruptured.
    ultimate_strain: f64,
    /// Whether this layer carries structural load and can fatigue like bone.
    bone_like: bool,
    /// Basquin-style fatigue strength coefficient (Pa); life = (σf'/σa)^m.
    fatigue_strength_pa: f64,
    /// Fatigue exponent m (dimensionless). Larger = steeper S–N curve.
    fatigue_exponent: f64,
    source: &'static str,
}

const SKIN_SRC: &str = "Agache et al. (1980); in-vivo skin E ~0.1-1 MPa, taken here as 0.30 MPa.";
const FAT_SRC: &str =
    "Adipose (unconfined E ~1-3 kPa); an effective in-situ compressive modulus of 25 kPa is used because the tissue is confined and near-incompressible.";
const MUSCLE_SRC: &str =
    "Passive skeletal muscle; effective in-situ transverse compressive modulus ~100 kPa (unconfined E is lower).";
const CARTILAGE_SRC: &str =
    "Articular cartilage compressive modulus ~0.5-1 MPa; poroelastic creep.";
const CORTICAL_SRC: &str =
    "Reilly & Burstein (1975): cortical bone E ~17 GPa; fatigue S-N from Carter & Caler (1981/1985) and Pattin et al. (1996).";
const TRABECULAR_SRC: &str = "Cancellous bone E ~0.1-2 GPa; reduced fatigue strength.";
const MARROW_SRC: &str = "Marrow approximated as a soft, non-structural filler.";
const AQUEOUS_SRC: &str = "Aqueous cell construct/medium approximated as a soft gel.";

fn props_for(class: MechClass) -> MechProps {
    match class {
        MechClass::Skin => MechProps {
            youngs_modulus_pa: 0.30e6,
            retardation_tau_s: 4.0,
            yield_strain: 0.30,
            ultimate_strain: 0.75,
            bone_like: false,
            fatigue_strength_pa: 0.0,
            fatigue_exponent: 0.0,
            source: SKIN_SRC,
        },
        MechClass::Fat => MechProps {
            youngs_modulus_pa: 25.0e3,
            retardation_tau_s: 8.0,
            yield_strain: 0.35,
            ultimate_strain: 0.60,
            bone_like: false,
            fatigue_strength_pa: 0.0,
            fatigue_exponent: 0.0,
            source: FAT_SRC,
        },
        MechClass::Muscle => MechProps {
            youngs_modulus_pa: 100.0e3,
            retardation_tau_s: 5.0,
            yield_strain: 0.30,
            ultimate_strain: 0.60,
            bone_like: false,
            fatigue_strength_pa: 0.0,
            fatigue_exponent: 0.0,
            source: MUSCLE_SRC,
        },
        MechClass::Cartilage => MechProps {
            youngs_modulus_pa: 0.70e6,
            retardation_tau_s: 90.0,
            yield_strain: 0.15,
            ultimate_strain: 0.30,
            bone_like: false,
            fatigue_strength_pa: 0.0,
            fatigue_exponent: 0.0,
            source: CARTILAGE_SRC,
        },
        MechClass::CorticalBone => MechProps {
            youngs_modulus_pa: 17.0e9,
            retardation_tau_s: 0.01,
            yield_strain: 0.007,
            ultimate_strain: 0.012,
            bone_like: true,
            // Calibrated so σa = 60 MPa -> ~1e3 cycles and σa = 40 MPa -> ~1e5
            // cycles, matching the steep S-N of cortical bone.
            fatigue_strength_pa: 110.2e6,
            fatigue_exponent: 11.37,
            source: CORTICAL_SRC,
        },
        MechClass::TrabecularBone => MechProps {
            youngs_modulus_pa: 0.5e9,
            retardation_tau_s: 0.05,
            yield_strain: 0.010,
            ultimate_strain: 0.020,
            bone_like: true,
            fatigue_strength_pa: 20.0e6,
            fatigue_exponent: 9.0,
            source: TRABECULAR_SRC,
        },
        MechClass::Marrow => MechProps {
            youngs_modulus_pa: 40.0e3,
            retardation_tau_s: 8.0,
            yield_strain: 0.40,
            ultimate_strain: 0.60,
            bone_like: false,
            fatigue_strength_pa: 0.0,
            fatigue_exponent: 0.0,
            source: MARROW_SRC,
        },
        MechClass::Aqueous => MechProps {
            youngs_modulus_pa: 30.0e3,
            retardation_tau_s: 2.0,
            yield_strain: 0.50,
            ultimate_strain: 0.80,
            bone_like: false,
            fatigue_strength_pa: 0.0,
            fatigue_exponent: 0.0,
            source: AQUEOUS_SRC,
        },
    }
}

/// Map a tissue layer's name to a mechanical class.
fn classify(name: &str) -> MechClass {
    let n = name.to_lowercase();
    if n.contains("cortical") || n.contains("skull") || n.contains("subchondral") {
        MechClass::CorticalBone
    } else if n.contains("trabecular") {
        MechClass::TrabecularBone
    } else if n.contains("marrow") {
        MechClass::Marrow
    } else if n.contains("cartilage") {
        MechClass::Cartilage
    } else if n.contains("muscle") {
        MechClass::Muscle
    } else if n.contains("fat") || n.contains("galea") || n.contains("subcut") || n.contains("hair")
    {
        MechClass::Fat
    } else if n.contains("culture") || n.contains("construct") || n.contains("medium") {
        MechClass::Aqueous
    } else {
        MechClass::Skin
    }
}

/// Cycles to failure from a Basquin S-N law, clamped to a sensible range.
fn cycles_to_failure(stress_amplitude_pa: f64, props: &MechProps) -> f64 {
    if !props.bone_like || props.fatigue_strength_pa <= 0.0 || stress_amplitude_pa <= 0.0 {
        return f64::INFINITY;
    }
    let ratio = props.fatigue_strength_pa / stress_amplitude_pa;
    ratio.powf(props.fatigue_exponent).clamp(1.0, 1.0e12)
}

// ---------------------------------------------------------------------------
// Serialized result types
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MechModelMetadata {
    pub name: &'static str,
    pub version: &'static str,
    pub scope: &'static str,
    pub governing_equations: Vec<&'static str>,
    pub citations: Vec<&'static str>,
    pub disclaimer: &'static str,
    pub validation_status: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MechInputs {
    pub applied_pressure_kpa: f64,
    pub contact_area_mm2: f64,
    pub hold_s: f64,
    pub recovery_s: f64,
    pub loading_mode: &'static str,
    pub waveform_shape: String,
    pub cycles: f64,
    pub frequency_hz: f64,
    pub duty_cycle: f64,
    pub minimum_pressure_fraction: f64,
    pub simulated_duration_s: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MechLayerResult {
    pub name: &'static str,
    pub class: &'static str,
    pub youngs_modulus_mpa: f64,
    pub thickness_mm: f64,
    pub peak_strain: f64,
    pub peak_stress_kpa: f64,
    pub compression_um: f64,
    pub residual_strain: f64,
    pub yielded: bool,
    pub source: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndentSample {
    pub time_s: f64,
    pub indentation_um: f64,
    pub phase: &'static str,
    pub cycle: Option<f64>,
    pub applied_pressure_kpa: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CycleSample {
    pub cycle: f64,
    pub damage: f64,
    pub permanent_shape_change_um: f64,
    pub residual_modulus_ratio: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FatigueResult {
    pub layer: &'static str,
    pub stress_amplitude_mpa: f64,
    pub strain_amplitude: f64,
    pub cycles_to_failure: f64,
    pub cycles_applied: f64,
    pub damage_fraction: f64,
    pub residual_modulus_ratio: f64,
    pub permanent_strain: f64,
    pub permanent_shape_change_um: f64,
    pub cycle_series: Vec<CycleSample>,
    pub verdict: &'static str,
    pub confidence: &'static str,
    pub basis: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PressureDurationPoint {
    pub duration_minutes: f64,
    pub threshold_pressure_kpa: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PressureInjuryRisk {
    pub applied_pressure_kpa: f64,
    pub duration_minutes: f64,
    pub threshold_pressure_kpa: f64,
    pub threshold_ratio: f64,
    pub classification: &'static str,
    pub confidence: &'static str,
    pub model: &'static str,
    pub citation: &'static str,
    pub caveat: &'static str,
    pub curve: Vec<PressureDurationPoint>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MechSummary {
    pub peak_indentation_um: f64,
    pub residual_indentation_um: f64,
    pub peak_stress_kpa: f64,
    pub max_strain: f64,
    pub deformation_percent: f64,
    pub total_thickness_mm: f64,
    pub verdict: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MechContactResult {
    pub contact_point_id: String,
    pub label: String,
    pub inputs: MechInputs,
    pub skin_profile: &'static SkinProfile,
    pub layers: Vec<MechLayerResult>,
    pub summary: MechSummary,
    pub indentation_series: Vec<IndentSample>,
    pub fatigue: Option<FatigueResult>,
    pub pressure_injury: Option<PressureInjuryRisk>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MechUnsupportedContact {
    pub contact_point_id: String,
    pub label: String,
    pub stimulus_type: String,
    pub reason: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MechanicsResponse {
    pub model: MechModelMetadata,
    pub contacts: Vec<MechContactResult>,
    pub unsupported_contacts: Vec<MechUnsupportedContact>,
    pub generated_at_unix_ms: u64,
}

// ---------------------------------------------------------------------------
// Core solve
// ---------------------------------------------------------------------------

/// Kelvin–Voigt creep strain under a step stress held for `t` seconds.
fn creep_strain(stress_pa: f64, modulus_pa: f64, tau_s: f64, t: f64) -> f64 {
    if modulus_pa <= 0.0 {
        return 0.0;
    }
    let asymptote = stress_pa / modulus_pa;
    if tau_s <= 1e-6 {
        return asymptote;
    }
    asymptote * (1.0 - (-t / tau_s).exp())
}

fn contact_radius_m(area_m2: f64) -> f64 {
    (area_m2 / std::f64::consts::PI).sqrt().max(1.0e-4)
}

/// Boussinesq axial normal stress under a uniformly loaded circular contact:
/// the fraction of the surface pressure still present on-axis at depth `z`.
/// This makes the contact load decay with depth instead of driving deep tissue
/// as if it were rigidly confined, which is what breaks a naive 1D column.
fn axial_decay(z_m: f64, a_m: f64) -> f64 {
    let z = z_m.max(0.0);
    let d = 1.0 - z.powi(3) / (a_m * a_m + z * z).powf(1.5);
    d.clamp(0.0, 1.0)
}

/// Compression (µm) of one layer, integrated over depth slices with the
/// Boussinesq stress decay and Kelvin–Voigt creep, capped at rupture strain.
fn layer_compression_um(
    depth_start_m: f64,
    thickness_m: f64,
    a_m: f64,
    stress_pa: f64,
    props: &MechProps,
    elapsed_s: f64,
    release: Option<f64>,
) -> f64 {
    let slices = ((thickness_m / 0.002).ceil() as usize).clamp(1, 24);
    let slice_m = thickness_m / slices as f64;
    let mut sum = 0.0;
    for s in 0..slices {
        let z = depth_start_m + slice_m * (s as f64 + 0.5);
        let eff = stress_pa * axial_decay(z, a_m);
        let strain = strain_at(eff, props, elapsed_s, release);
        sum += strain * slice_m;
    }
    sum * 1.0e6
}

/// Strain of a material point under effective stress, during loading or the
/// exponential recovery after release (leaving permanent set once yielded).
fn strain_at(eff_stress_pa: f64, props: &MechProps, elapsed_s: f64, release: Option<f64>) -> f64 {
    let strain = match release {
        None => creep_strain(
            eff_stress_pa,
            props.youngs_modulus_pa,
            props.retardation_tau_s,
            elapsed_s,
        ),
        Some(hold_s) => {
            let at_release = creep_strain(
                eff_stress_pa,
                props.youngs_modulus_pa,
                props.retardation_tau_s,
                hold_s,
            );
            let elastic = eff_stress_pa / props.youngs_modulus_pa;
            let permanent = (elastic - props.yield_strain).max(0.0);
            let recoverable = (at_release - permanent).max(0.0);
            let tau = props.retardation_tau_s.max(1.0e-6);
            permanent + recoverable * (-(elapsed_s - hold_s) / tau).exp()
        }
    };
    // Cap at rupture: the small-strain model is not meaningful past failure.
    strain.min(props.ultimate_strain)
}

/// Total column indentation (µm) at a given time. Layers below the first
/// structural (bone) layer are shielded — the stiff layer backs them.
fn column_indentation_um(
    profile: &SkinProfile,
    stress_pa: f64,
    a_m: f64,
    elapsed_s: f64,
    release: Option<f64>,
) -> f64 {
    let mut depth = 0.0;
    let mut total = 0.0;
    for layer in profile.layers {
        let props = props_for(classify(layer.name));
        let th = layer.thickness_m.value;
        total += layer_compression_um(depth, th, a_m, stress_pa, &props, elapsed_s, release);
        depth += th;
        if props.bone_like {
            break;
        }
    }
    total
}

/// Kelvin–Voigt state after `completed_cycles` full load/unload periods.
///
/// The recurrence is analytic, so a 100k-cycle protocol does not need 100k
/// solver steps. `minimum_pressure_fraction` defines the unloaded baseline:
/// zero is full release, while a nonzero value models a retained preload.
fn cyclic_layer_state(
    low_stress_pa: f64,
    high_stress_pa: f64,
    props: &MechProps,
    load_s: f64,
    unload_s: f64,
    completed_cycles: f64,
) -> (f64, f64) {
    let tau = props.retardation_tau_s.max(1.0e-6);
    let alpha = (-load_s / tau).exp();
    let beta = (-unload_s / tau).exp();
    let low_target = low_stress_pa / props.youngs_modulus_pa;
    let high_target = high_stress_pa / props.youngs_modulus_pa;
    let multiplier = alpha * beta;
    let offset = low_target * (1.0 - beta) + beta * high_target * (1.0 - alpha);
    let cycles = completed_cycles.max(0.0);
    let low_before = if (1.0 - multiplier).abs() < 1.0e-12 {
        offset * cycles
    } else {
        offset * (1.0 - multiplier.powf(cycles)) / (1.0 - multiplier)
    };
    let high_after = high_target + (low_before - high_target) * alpha;
    (
        low_before.min(props.ultimate_strain),
        high_after.min(props.ultimate_strain),
    )
}

/// Approximate a column indentation from one strain value per layer. This is
/// used only for the cyclic waveform; stress decay is evaluated at each layer
/// midpoint when deriving the states above.
fn indentation_from_layer_strains_um(profile: &SkinProfile, strains: &[f64]) -> f64 {
    let mut total = 0.0;
    for (index, layer) in profile.layers.iter().enumerate() {
        let props = props_for(classify(layer.name));
        if let Some(strain) = strains.get(index) {
            total += strain.min(props.ultimate_strain) * layer.thickness_m.value * 1.0e6;
        }
        if props.bone_like {
            break;
        }
    }
    total
}

fn cyclic_indentation_at(
    profile: &SkinProfile,
    high_stress_pa: f64,
    a_m: f64,
    load_s: f64,
    unload_s: f64,
    minimum_pressure_fraction: f64,
    completed_cycles: f64,
    at_load_peak: bool,
) -> f64 {
    let mut depth_m = 0.0;
    let mut strains = Vec::with_capacity(profile.layers.len());
    for layer in profile.layers {
        let props = props_for(classify(layer.name));
        let mid_depth = depth_m + layer.thickness_m.value * 0.5;
        let high = high_stress_pa * axial_decay(mid_depth, a_m);
        let low = high * minimum_pressure_fraction;
        let (low_state, high_state) =
            cyclic_layer_state(low, high, &props, load_s, unload_s, completed_cycles);
        strains.push(if at_load_peak { high_state } else { low_state });
        depth_m += layer.thickness_m.value;
        if props.bone_like {
            break;
        }
    }
    indentation_from_layer_strains_um(profile, &strains)
}

/// Select representative cycle indices for a bounded, readable time series.
/// The physics uses the actual requested cycle count; only chart sampling is
/// compressed for large protocols.
fn representative_cycles(cycles: f64) -> Vec<f64> {
    let whole = cycles.floor().max(1.0);
    if whole <= 40.0 {
        return (0..=whole as usize).map(|value| value as f64).collect();
    }

    let mut values = vec![0.0, 1.0, 2.0, 3.0];
    let log_max = whole.log10();
    for step in 0..48 {
        let value = 10f64.powf(log_max * step as f64 / 47.0).round();
        values.push(value.clamp(1.0, whole));
    }
    values.push(whole);
    values.sort_by(|a, b| a.total_cmp(b));
    values.dedup_by(|a, b| (*a - *b).abs() < 0.5);
    values
}

fn build_cyclic_indentation_series(
    profile: &SkinProfile,
    stress_pa: f64,
    a_m: f64,
    cycles: f64,
    frequency_hz: f64,
    duty_cycle: f64,
    minimum_pressure_fraction: f64,
    recovery_s: f64,
    waveform_shape: &str,
) -> Vec<IndentSample> {
    let period_s = 1.0 / frequency_hz.max(0.01);
    let load_s = (period_s * duty_cycle.clamp(0.01, 0.99)).max(1.0e-5);
    let unload_s = (period_s - load_s).max(1.0e-5);
    let applied_pressure_kpa = stress_pa / 1000.0;
    let mut series = Vec::new();

    for cycle in representative_cycles(cycles) {
        let completed_before = cycle.max(0.0);
        let low = cyclic_indentation_at(
            profile,
            stress_pa,
            a_m,
            load_s,
            unload_s,
            minimum_pressure_fraction,
            completed_before,
            false,
        );
        let high = cyclic_indentation_at(
            profile,
            stress_pa,
            a_m,
            load_s,
            unload_s,
            minimum_pressure_fraction,
            completed_before,
            true,
        );
        let phases: &[(f64, f64, &'static str)] = match waveform_shape {
            "sinusoidal" => &[
                (0.0, 0.0, "cyclic-recovery"),
                (0.25, 0.5, "cyclic-loading"),
                (0.5, 1.0, "cyclic-loading"),
                (0.75, 0.5, "cyclic-release"),
                (1.0, 0.0, "cyclic-recovery"),
            ],
            "trapezoidal" => &[
                (0.0, 0.0, "cyclic-recovery"),
                (0.2, 1.0, "cyclic-ramp"),
                (0.6, 1.0, "cyclic-loading"),
                (0.8, 0.0, "cyclic-release"),
                (1.0, 0.0, "cyclic-recovery"),
            ],
            _ => &[
                (0.0, 0.0, "cyclic-recovery"),
                (0.001, 1.0, "cyclic-loading"),
                (0.5, 1.0, "cyclic-loading"),
                (0.501, 0.0, "cyclic-release"),
                (1.0, 0.0, "cyclic-recovery"),
            ],
        };
        for (phase_fraction, amplitude, phase) in phases {
            if cycle >= cycles && *phase_fraction > 0.0 {
                continue;
            }
            let pressure_fraction =
                minimum_pressure_fraction + (1.0 - minimum_pressure_fraction) * amplitude;
            series.push(IndentSample {
                time_s: (completed_before + phase_fraction) * period_s,
                indentation_um: low + (high - low) * amplitude,
                phase,
                cycle: Some(completed_before + phase_fraction),
                applied_pressure_kpa: applied_pressure_kpa * pressure_fraction,
            });
        }
    }

    // Allow a final observed recovery after the last repetition, using the
    // existing release model. This makes recoveryS meaningful in cyclic mode.
    if recovery_s > 0.0 {
        let final_high = cyclic_indentation_at(
            profile,
            stress_pa,
            a_m,
            load_s,
            unload_s,
            minimum_pressure_fraction,
            cycles.max(1.0) - 1.0,
            true,
        );
        let end_s = cycles.max(1.0) * period_s;
        let samples = 20usize;
        for index in 1..=samples {
            let recovery_t = recovery_s * index as f64 / samples as f64;
            let decay = (-recovery_t / 8.0).exp();
            series.push(IndentSample {
                time_s: end_s + recovery_t,
                indentation_um: final_high * decay,
                phase: "recovery",
                cycle: Some(cycles),
                applied_pressure_kpa: 0.0,
            });
        }
    }

    series.sort_by(|a, b| a.time_s.total_cmp(&b.time_s));
    series
}

/// Contemporary sigmoid pressure-time threshold used as a transparent
/// Reswick-Rogers-style screening curve. The coefficients are from the
/// Linder-Ganz/Gefen rat-muscle cell-death model, so this is deliberately
/// labelled extrapolated rather than presented as a validated human limit.
pub(crate) fn pressure_time_threshold_kpa(duration_minutes: f64) -> f64 {
    const P_MAX_KPA: f64 = 31.0;
    const P_MIN_KPA: f64 = 8.0;
    const LAMBDA_PER_MIN: f64 = 0.15;
    const T0_MIN: f64 = 95.0;
    P_MIN_KPA
        + (P_MAX_KPA - P_MIN_KPA)
            / (1.0 + (LAMBDA_PER_MIN * (duration_minutes.max(0.0) - T0_MIN)).exp())
}

fn pressure_injury_screen(applied_pressure_kpa: f64, hold_s: f64) -> PressureInjuryRisk {
    let duration_minutes = hold_s / 60.0;
    let threshold_pressure_kpa = pressure_time_threshold_kpa(duration_minutes);
    let threshold_ratio = applied_pressure_kpa / threshold_pressure_kpa.max(1.0e-9);
    let classification = if threshold_ratio >= 1.0 {
        "Exceeds threshold"
    } else if threshold_ratio >= 0.8 {
        "Approaching threshold"
    } else {
        "Below threshold"
    };
    let curve = [
        0.0, 5.0, 15.0, 30.0, 60.0, 90.0, 120.0, 180.0, 240.0, 360.0, 480.0,
        720.0, 1440.0,
    ]
        .into_iter()
        .map(|duration_minutes| PressureDurationPoint {
            duration_minutes,
            threshold_pressure_kpa: pressure_time_threshold_kpa(duration_minutes),
        })
        .collect();

    PressureInjuryRisk {
        applied_pressure_kpa,
        duration_minutes,
        threshold_pressure_kpa,
        threshold_ratio,
        classification,
        confidence: "extrapolated",
        model: "Sigmoid pressure-time cell-death threshold",
        citation: "Linder-Ganz E, Engelberg S, Scheinowitz M, Gefen A. J Biomech. 2006;39(14):2725-2732.",
        caveat: "Screening only: coefficients are from compressed rat skeletal muscle, not a validated human skin pressure-injury limit. Reswick-Rogers established the inverse pressure-duration concept but not a robust universal equation.",
        curve,
    }
}

fn simulate_mechanics_contact(
    contact: &SimulationContact,
    profile: &'static SkinProfile,
) -> Result<MechContactResult, String> {
    let applied_pressure_kpa = contact.number_or("appliedPressureKpa", 50.0).max(0.0);
    let contact_area_mm2 = contact.number_or("contactAreaMm2", 400.0).max(0.1);
    let hold_s = contact.number_or("holdDurationS", 30.0).max(0.1);
    let recovery_s = contact.number_or("recoveryS", 30.0).max(0.0);
    let loading_mode_raw = contact.text("loadingMode", "static");
    let is_cyclic = loading_mode_raw == "cyclic";
    let waveform_shape = contact.text("waveformShape", "square").to_string();
    let cycles = contact.number_or("cycles", 100000.0).max(1.0);
    let frequency_hz = contact.number_or("frequencyHz", 1.0).max(0.01);
    let duty_cycle = (contact.number_or("dutyCycle", 50.0) / 100.0).clamp(0.01, 0.99);
    let minimum_pressure_fraction = contact.number_or("minimumPressureFraction", 0.0) / 100.0;
    let minimum_pressure_fraction = minimum_pressure_fraction.clamp(0.0, 0.95);

    let stress_pa = applied_pressure_kpa * 1000.0;
    let a_m = contact_radius_m(contact_area_mm2 * 1.0e-6);

    if profile.layers.is_empty() {
        return Err("Tissue profile has no layers to load.".to_string());
    }

    let mut layers: Vec<MechLayerResult> = Vec::with_capacity(profile.layers.len());
    let mut total_thickness_m = 0.0;
    let mut max_strain = 0.0f64;
    let mut warnings: Vec<String> = Vec::new();
    let mut depth_m = 0.0;
    let mut shielded = false;

    // Series equilibrium with Boussinesq depth-decay; bone shields tissue behind it.
    for layer in profile.layers {
        let class = classify(layer.name);
        let props = props_for(class);
        let thickness_m = layer.thickness_m.value;
        total_thickness_m += thickness_m;

        let decay_top = axial_decay(depth_m, a_m);
        let eff_stress_top = stress_pa * decay_top;
        let elastic_top = eff_stress_top / props.youngs_modulus_pa;

        let (peak_strain, compression_um, yielded, residual_strain) = if shielded {
            (0.0, 0.0, false, 0.0)
        } else {
            let peak = strain_at(eff_stress_top, &props, hold_s, None);
            let comp =
                layer_compression_um(depth_m, thickness_m, a_m, stress_pa, &props, hold_s, None);
            let yld = elastic_top > props.yield_strain;
            // Cap the permanent set at rupture: the small-strain model is not
            // meaningful past the ultimate strain (the layer has failed).
            let capped_elastic = elastic_top.min(props.ultimate_strain);
            let residual = if yld {
                (capped_elastic - props.yield_strain).max(0.0)
            } else {
                0.0
            };
            if elastic_top > props.ultimate_strain {
                warnings.push(format!(
                    "{}: strain {:.0}% exceeds the ultimate strain — rupture likely.",
                    layer.name,
                    elastic_top * 100.0
                ));
            }
            (peak, comp, yld, residual)
        };

        max_strain = max_strain.max(peak_strain);

        layers.push(MechLayerResult {
            name: layer.name,
            class: class.label(),
            youngs_modulus_mpa: props.youngs_modulus_pa / 1.0e6,
            thickness_mm: thickness_m * 1000.0,
            peak_strain,
            peak_stress_kpa: eff_stress_top / 1000.0,
            compression_um,
            residual_strain,
            yielded,
            source: props.source,
        });

        depth_m += thickness_m;
        if props.bone_like && !shielded {
            shielded = true;
        }
    }

    let peak_indentation_um: f64 = layers.iter().map(|l| l.compression_um).sum();
    let residual_indentation_um: f64 = layers
        .iter()
        .map(|l| l.residual_strain * (l.thickness_mm / 1000.0) * 1.0e6)
        .sum();
    let deformation_percent = if total_thickness_m > 0.0 {
        peak_indentation_um / (total_thickness_m * 1.0e6) * 100.0
    } else {
        0.0
    };

    // A cyclic protocol is a time-domain load/unload waveform, not just a
    // static result with a fatigue number appended. Large cycle counts are
    // analytically propagated and sparsely sampled for display.
    let indentation_series = if is_cyclic {
        build_cyclic_indentation_series(
            profile,
            stress_pa,
            a_m,
            cycles,
            frequency_hz,
            duty_cycle,
            minimum_pressure_fraction,
            recovery_s,
            waveform_shape.as_str(),
        )
    } else {
        build_indentation_series(profile, stress_pa, a_m, hold_s, recovery_s)
    };

    let cyclic_peak_indentation_um = indentation_series
        .iter()
        .map(|sample| sample.indentation_um)
        .fold(0.0, f64::max);
    let cyclic_residual_indentation_um = indentation_series
        .last()
        .map(|sample| sample.indentation_um)
        .unwrap_or(0.0);

    // Fatigue: evaluate the stiffest bone-like layer under cyclic load.
    let fatigue = if is_cyclic {
        compute_fatigue(profile, stress_pa, a_m, cycles)
    } else {
        None
    };
    let pressure_injury = if is_cyclic {
        None
    } else {
        Some(pressure_injury_screen(applied_pressure_kpa, hold_s))
    };

    let any_yield = layers.iter().any(|l| l.yielded);
    let fatigue_fails = fatigue
        .as_ref()
        .map(|f| f.cycles_applied >= f.cycles_to_failure)
        .unwrap_or(false);

    let verdict = if fatigue_fails {
        "Fatigue fracture predicted for the applied cycles"
    } else if any_yield {
        "Permanent deformation — a layer exceeded its yield strain"
    } else if deformation_percent > 5.0 {
        "Large but reversible deformation"
    } else {
        "Minimal, reversible deformation"
    };

    if is_cyclic && fatigue.is_none() {
        warnings.push(
            "No fatigue-relevant structural layer was found; cyclic fatigue was not evaluated."
                .to_string(),
        );
    } else if fatigue
        .as_ref()
        .map(|result| result.confidence == "extrapolated")
        .unwrap_or(false)
    {
        warnings.push(
            "Soft-tissue cyclic fatigue life is an extrapolated strain-life screen, not a validated human failure prediction."
                .to_string(),
        );
    }

    let summary = MechSummary {
        peak_indentation_um: if is_cyclic {
            cyclic_peak_indentation_um
        } else {
            peak_indentation_um
        },
        residual_indentation_um: if is_cyclic {
            cyclic_residual_indentation_um
        } else {
            residual_indentation_um
        },
        peak_stress_kpa: stress_pa / 1000.0,
        max_strain,
        deformation_percent,
        total_thickness_mm: total_thickness_m * 1000.0,
        verdict,
    };

    Ok(MechContactResult {
        contact_point_id: contact.id.clone(),
        label: contact.label.clone(),
        inputs: MechInputs {
            applied_pressure_kpa,
            contact_area_mm2,
            hold_s,
            recovery_s,
            loading_mode: if is_cyclic { "cyclic" } else { "static" },
            waveform_shape,
            cycles,
            frequency_hz,
            duty_cycle,
            minimum_pressure_fraction,
            simulated_duration_s: indentation_series
                .last()
                .map(|sample| sample.time_s)
                .unwrap_or(hold_s + recovery_s),
        },
        skin_profile: profile,
        layers,
        summary,
        indentation_series,
        fatigue,
        pressure_injury,
        warnings,
    })
}

fn build_indentation_series(
    profile: &SkinProfile,
    stress_pa: f64,
    a_m: f64,
    hold_s: f64,
    recovery_s: f64,
) -> Vec<IndentSample> {
    let total = hold_s + recovery_s;
    let samples = 120usize;
    let mut series = Vec::with_capacity(samples + 1);

    for i in 0..=samples {
        let t = total * (i as f64) / (samples as f64);
        let releasing = t > hold_s;
        let release = if releasing { Some(hold_s) } else { None };
        series.push(IndentSample {
            time_s: t,
            indentation_um: column_indentation_um(profile, stress_pa, a_m, t, release),
            phase: if releasing { "recovery" } else { "loading" },
            cycle: None,
            applied_pressure_kpa: if releasing { 0.0 } else { stress_pa / 1000.0 },
        });
    }
    series
}

fn compute_fatigue(
    profile: &'static SkinProfile,
    stress_pa: f64,
    a_m: f64,
    cycles: f64,
) -> Option<FatigueResult> {
    // Pick the stiffest bone-like layer as the load-bearing element, using the
    // contact stress that actually reaches it (decayed with depth).
    let mut best_bone: Option<(&str, MechProps, f64, f64)> = None;
    let mut best_soft: Option<(&str, MechProps, f64, f64, f64)> = None;
    let mut depth = 0.0;
    for layer in profile.layers {
        let class = classify(layer.name);
        let props = props_for(class);
        let mid = depth + layer.thickness_m.value * 0.5;
        if props.bone_like {
            let better = match &best_bone {
                Some((_, p, _, _)) => props.youngs_modulus_pa > p.youngs_modulus_pa,
                None => true,
            };
            if better {
                best_bone = Some((layer.name, props, layer.thickness_m.value, mid));
            }
        } else if matches!(
            class,
            MechClass::Skin | MechClass::Fat | MechClass::Muscle | MechClass::Cartilage
        ) {
            let local_stress = stress_pa * axial_decay(mid, a_m);
            let normalized_strain =
                (local_stress / props.youngs_modulus_pa) / props.yield_strain.max(1.0e-9);
            let better = best_soft
                .as_ref()
                .map(|(_, _, _, _, score)| normalized_strain > *score)
                .unwrap_or(true);
            if better {
                best_soft = Some((
                    layer.name,
                    props,
                    layer.thickness_m.value,
                    mid,
                    normalized_strain,
                ));
            }
        }
        depth += layer.thickness_m.value;
    }

    let (name, props, thickness_m, mid_depth, confidence, basis) =
        if let Some((name, props, thickness_m, mid_depth)) = best_bone {
            (
                name,
                props,
                thickness_m,
                mid_depth,
                "established",
                "Cortical/trabecular bone Basquin S-N relation with Palmgren-Miner linear damage.",
            )
        } else {
            let (name, props, thickness_m, mid_depth, _) = best_soft?;
            (
                name,
                props,
                thickness_m,
                mid_depth,
                "extrapolated",
                "Generic soft-tissue strain-life screening curve; no site-specific human cyclic-fatigue dataset is available. Do not interpret Nf as a validated failure life.",
            )
        };
    let layer_stress = stress_pa * axial_decay(mid_depth, a_m);
    let strain_amplitude = layer_stress / props.youngs_modulus_pa;
    let nf = if props.bone_like {
        cycles_to_failure(layer_stress, &props)
    } else {
        // Conservative Basquin-like strain-life screen anchored to half the
        // layer yield strain at one cycle. It is intentionally extrapolated.
        (0.5 * props.yield_strain / strain_amplitude.max(1.0e-12))
            .max(1.0)
            .powf(6.0)
            .clamp(1.0, 1.0e12)
    };
    let damage = (cycles / nf).min(1.0);
    // Pattin/Carter: modulus degrades progressively with damage.
    let residual_modulus_ratio = (1.0 - 0.35 * damage).max(0.0);
    // Permanent (creep-fatigue) strain grows toward the yield strain at failure.
    let permanent_strain = props.yield_strain * damage;
    let permanent_shape_change_um = permanent_strain * thickness_m * 1.0e6;

    let verdict = if cycles >= nf {
        "Fatigue fracture predicted at N ≈ Nf"
    } else if damage > 0.1 {
        "Significant fatigue microdamage accumulating"
    } else {
        "Within fatigue endurance for the applied cycles"
    };

    // Sample damage/shape-change across a log sweep of cycle counts.
    let max_cycle = cycles.max(nf).min(1.0e12);
    let mut cycle_series = Vec::new();
    let steps = 60usize;
    let log_max = max_cycle.log10().max(0.0);
    for i in 0..=steps {
        let c = 10f64.powf(log_max * (i as f64) / (steps as f64));
        let d = (c / nf).min(1.0);
        cycle_series.push(CycleSample {
            cycle: c,
            damage: d,
            permanent_shape_change_um: props.yield_strain * d * thickness_m * 1.0e6,
            residual_modulus_ratio: (1.0 - 0.35 * d).max(0.0),
        });
    }

    Some(FatigueResult {
        layer: name,
        stress_amplitude_mpa: layer_stress / 1.0e6,
        strain_amplitude,
        cycles_to_failure: nf,
        cycles_applied: cycles,
        damage_fraction: damage,
        residual_modulus_ratio,
        permanent_strain,
        permanent_shape_change_um,
        cycle_series,
        verdict,
        confidence,
        basis,
    })
}

fn model_metadata() -> MechModelMetadata {
    MechModelMetadata {
        name: "Vide 1D layered mechanical model",
        version: MECH_MODEL_VERSION,
        scope: "Normal-contact compression of a layered tissue column: viscoelastic creep, recovery, permanent set, pressure-time screening, bone fatigue and explicitly extrapolated soft-tissue cyclic fatigue.",
        governing_equations: vec![
            "σ constant through depth (1D series equilibrium)",
            "ε(t) = (σ/E)(1 − e^{−t/τ})   (Kelvin–Voigt creep)",
            "Nf = (σf'/σa)^m   (Basquin S–N, cortical bone)",
            "D = N/Nf   (Palmgren–Miner linear damage)",
            "P_threshold(t) = Pmin + (Pmax − Pmin)/(1 + exp(λ(t − t0)))",
        ],
        citations: vec![
            "Agache PG et al. (1980). Mechanical properties and Young's modulus of human skin in vivo. Arch Dermatol Res 269:221-232.",
            "Reilly DT, Burstein AH (1975). The elastic and ultimate properties of compact bone tissue. J Biomech 8(6):393-405.",
            "Carter DR, Caler WE (1985). A cumulative damage model for bone fracture. J Orthop Res 3(1):84-90.",
            "Pattin CA, Caler WE, Carter DR (1996). Cyclic mechanical property degradation during fatigue loading of cortical bone. J Biomech 29(1):69-79.",
            "Linder-Ganz E et al. (2006). Pressure-time cell death threshold for albino rat skeletal muscles. J Biomech 39(14):2725-2732.",
        ],
        disclaimer:
            "Research screening model. 1D, small-strain, representative literature constants; not a validated FEA substitute or clinical prediction.",
        validation_status:
            "Verified for internal consistency (series compliance, creep asymptote, Miner damage). Not validated against experimental deformation datasets.",
    }
}

pub fn run_mechanics_simulation(request: SimulationRequest) -> Result<MechanicsResponse, String> {
    let mut contacts = Vec::new();
    let mut unsupported = Vec::new();

    for contact in &request.contacts {
        if contact.stimulus_type != "pressure" {
            unsupported.push(MechUnsupportedContact {
                contact_point_id: contact.id.clone(),
                label: contact.label.clone(),
                stimulus_type: contact.stimulus_type.clone(),
                reason: "The mechanical solver handles pressure contacts only.",
            });
            continue;
        }

        let profile = skin_profile(contact.text("skinProfileId", DEFAULT_SKIN_PROFILE_ID))
            .unwrap_or_else(|| skin_profile(DEFAULT_SKIN_PROFILE_ID).unwrap());

        contacts.push(simulate_mechanics_contact(contact, profile)?);
    }

    let generated_at_unix_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    Ok(MechanicsResponse {
        model: model_metadata(),
        contacts,
        unsupported_contacts: unsupported,
        generated_at_unix_ms,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn pressure_contact(params: &[(&str, f64)], opts: &[(&str, &str)]) -> SimulationContact {
        SimulationContact {
            id: "cp-1".to_string(),
            label: "CP-1".to_string(),
            stimulus_type: "pressure".to_string(),
            parameters: params.iter().map(|(k, v)| (k.to_string(), *v)).collect(),
            options: opts
                .iter()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect(),
        }
    }

    fn profile(id: &str) -> &'static SkinProfile {
        skin_profile(id).unwrap()
    }

    #[test]
    fn softer_tissue_compresses_more_than_bone() {
        // Same stress: a soft skin column indents far more than a bony column.
        let skin = simulate_mechanics_contact(
            &pressure_contact(
                &[("appliedPressureKpa", 20.0)],
                &[("skinProfileId", "volar-forearm")],
            ),
            profile("volar-forearm"),
        )
        .unwrap();
        let bone = simulate_mechanics_contact(
            &pressure_contact(
                &[("appliedPressureKpa", 20.0)],
                &[("skinProfileId", "cortical-bone")],
            ),
            profile("cortical-bone"),
        )
        .unwrap();

        assert!(
            skin.summary.peak_indentation_um > bone.summary.peak_indentation_um,
            "skin {:.2} um should exceed bone {:.2} um",
            skin.summary.peak_indentation_um,
            bone.summary.peak_indentation_um
        );
    }

    #[test]
    fn creep_grows_with_hold_time() {
        let short = simulate_mechanics_contact(
            &pressure_contact(&[("appliedPressureKpa", 5.0), ("holdDurationS", 0.5)], &[]),
            profile("volar-forearm"),
        )
        .unwrap();
        let long = simulate_mechanics_contact(
            &pressure_contact(
                &[("appliedPressureKpa", 5.0), ("holdDurationS", 120.0)],
                &[],
            ),
            profile("volar-forearm"),
        )
        .unwrap();

        assert!(long.summary.peak_indentation_um > short.summary.peak_indentation_um);
    }

    #[test]
    fn cyclic_protocol_contains_repeated_load_and_recovery_extrema() {
        let result = simulate_mechanics_contact(
            &pressure_contact(
                &[
                    ("appliedPressureKpa", 10.0),
                    ("cycles", 10.0),
                    ("frequencyHz", 2.0),
                    ("dutyCycle", 40.0),
                    ("minimumPressureFraction", 0.0),
                    ("recoveryS", 0.0),
                ],
                &[("loadingMode", "cyclic")],
            ),
            profile("volar-forearm"),
        )
        .unwrap();

        assert!(result
            .indentation_series
            .iter()
            .any(|sample| sample.phase == "cyclic-loading"));
        assert!(result
            .indentation_series
            .iter()
            .any(|sample| sample.phase == "cyclic-recovery"));
        assert_eq!(result.inputs.simulated_duration_s, 5.0);
        let peak = result
            .indentation_series
            .iter()
            .filter(|sample| sample.phase == "cyclic-loading")
            .map(|sample| sample.indentation_um)
            .fold(0.0, f64::max);
        let trough = result
            .indentation_series
            .iter()
            .filter(|sample| sample.phase == "cyclic-recovery")
            .map(|sample| sample.indentation_um)
            .fold(f64::INFINITY, f64::min);
        assert!(peak > trough);
    }

    #[test]
    fn higher_stress_shortens_bone_fatigue_life() {
        let low = simulate_mechanics_contact(
            &pressure_contact(
                &[("appliedPressureKpa", 40_000.0), ("cycles", 1.0)],
                &[
                    ("skinProfileId", "cortical-bone"),
                    ("loadingMode", "cyclic"),
                ],
            ),
            profile("cortical-bone"),
        )
        .unwrap();
        let high = simulate_mechanics_contact(
            &pressure_contact(
                &[("appliedPressureKpa", 80_000.0), ("cycles", 1.0)],
                &[
                    ("skinProfileId", "cortical-bone"),
                    ("loadingMode", "cyclic"),
                ],
            ),
            profile("cortical-bone"),
        )
        .unwrap();

        let low_nf = low.fatigue.as_ref().unwrap().cycles_to_failure;
        let high_nf = high.fatigue.as_ref().unwrap().cycles_to_failure;
        assert!(
            high_nf < low_nf,
            "higher stress must give fewer cycles: {high_nf} !< {low_nf}"
        );
    }

    #[test]
    fn sn_curve_matches_calibration_anchor() {
        // σa = 60 MPa should give roughly 1000 cycles for cortical bone.
        let props = props_for(MechClass::CorticalBone);
        let nf = cycles_to_failure(60.0e6, &props);
        assert!((900.0..1200.0).contains(&nf), "Nf at 60 MPa was {nf}");
    }

    #[test]
    fn miner_damage_reaches_unity_at_failure() {
        let r = simulate_mechanics_contact(
            &pressure_contact(
                &[("appliedPressureKpa", 60_000.0), ("cycles", 100000.0)],
                &[
                    ("skinProfileId", "cortical-bone"),
                    ("loadingMode", "cyclic"),
                ],
            ),
            profile("cortical-bone"),
        )
        .unwrap();
        let f = r.fatigue.as_ref().unwrap();
        assert!(f.damage_fraction >= 1.0 - 1e-9);
        assert!(f.permanent_shape_change_um > 0.0);
        assert!(r.summary.verdict.contains("Fatigue"));
    }

    #[test]
    fn pressure_time_threshold_declines_with_duration() {
        assert!(pressure_time_threshold_kpa(30.0) > pressure_time_threshold_kpa(240.0));
    }

    #[test]
    fn soft_tissue_cyclic_life_is_explicitly_extrapolated() {
        let result = simulate_mechanics_contact(
            &pressure_contact(
                &[("appliedPressureKpa", 20.0), ("cycles", 1000.0)],
                &[("loadingMode", "cyclic"), ("waveformShape", "sinusoidal")],
            ),
            profile("volar-forearm"),
        )
        .unwrap();
        let fatigue = result.fatigue.expect("soft-tissue fatigue screen");
        assert_eq!(fatigue.confidence, "extrapolated");
        assert!(result
            .indentation_series
            .iter()
            .any(|sample| sample.phase == "cyclic-release"));
    }

    #[test]
    fn non_pressure_contacts_are_unsupported() {
        let mut params = HashMap::new();
        params.insert("temperatureC".to_string(), 44.0);
        let request = SimulationRequest {
            contacts: vec![SimulationContact {
                id: "cp-1".to_string(),
                label: "CP-1".to_string(),
                stimulus_type: "heat".to_string(),
                parameters: params,
                options: HashMap::new(),
            }],
            settings: Default::default(),
        };
        let response = run_mechanics_simulation(request).unwrap();
        assert!(response.contacts.is_empty());
        assert_eq!(response.unsupported_contacts.len(), 1);
    }
}
