//! Solver verification.
//!
//! These cases answer "does the code solve the equations it claims to solve",
//! which is a different and weaker question than "do those equations describe
//! real skin". Passing this suite is a precondition for any accuracy claim, not
//! evidence of one. Validation against published experimental data is a
//! separate step and is not performed here.

use serde::Serialize;

use super::model::{ArrheniusRegime, DamageModel, MODEL_VERSION};
use super::solver::{
    build_mesh, erfc, steady_state, BloodProperties, DeviceModel, LayerMaterial, Phase,
    SolverState, SurfaceCoupling,
};

/// A damage model that never accumulates, so verification runs are unaffected
/// by the choice of injury kinetics.
const NO_DAMAGE: DamageModel = DamageModel {
    id: "none",
    label: "No damage integration",
    threshold_c: f64::INFINITY,
    regimes: &[] as &[ArrheniusRegime],
    citation: "",
    review_status: "",
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerificationCase {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub reference: &'static str,
    pub metric: &'static str,
    pub error: f64,
    pub tolerance: f64,
    pub passed: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerificationSuite {
    pub model_version: &'static str,
    pub cases: Vec<VerificationCase>,
    pub passed: bool,
    pub summary: String,
    pub scope: &'static str,
}

fn uniform_layer(thickness_m: f64, conductivity: f64) -> LayerMaterial {
    LayerMaterial {
        thickness_m,
        density_kg_per_m3: 1000.0,
        specific_heat_j_per_kg_k: 4000.0,
        conductivity_w_per_m_k: conductivity,
        perfusion_per_s: 0.0,
        metabolic_w_per_m3: 0.0,
    }
}

/// Semi-infinite solid subjected to a step change in surface temperature.
///
/// T(x,t) = T_s + (T_0 − T_s)·erf( x / (2√(αt)) )
fn case_step_surface_temperature() -> VerificationCase {
    let initial_c = 37.0;
    let surface_c = 80.0;
    let duration_s = 60.0;

    let layers = [uniform_layer(0.05, 0.5)];
    let mesh = build_mesh(
        &layers,
        10e-6,
        400e-6,
        1.12,
        BloodProperties {
            temperature_c: initial_c,
            ..BloodProperties::default()
        },
        initial_c,
    );

    let alpha = 0.5 / (1000.0 * 4000.0);
    let count = mesh.cell_count();
    let mut state = SolverState::new(mesh, vec![initial_c; count], surface_c);

    state.run_phase(
        Phase {
            duration_s,
            surface: SurfaceCoupling::Conductance {
                // An infinite external conductance reduces to a Dirichlet
                // surface, which is what the analytic solution assumes.
                conductance: f64::INFINITY,
                external_c: surface_c,
            },
            device: None,
        },
        0.02,
        &NO_DAMAGE,
        |_, _| {},
    );

    let denominator = 2.0 * (alpha * duration_s).sqrt();
    let mut max_error: f64 = 0.0;
    for (index, cell) in state.mesh.cells.iter().enumerate() {
        let analytic =
            surface_c + (initial_c - surface_c) * super::solver::erf(cell.center_m / denominator);
        max_error = max_error.max((state.temperature_c[index] - analytic).abs());
    }

    VerificationCase {
        id: "semi-infinite-step-temperature",
        name: "Semi-infinite solid, step surface temperature",
        description:
            "43 °C step applied to a homogeneous half-space for 60 s, compared against the closed-form error-function solution at every cell centre.",
        reference: "Carslaw HS & Jaeger JC (1959), Conduction of Heat in Solids, §2.5.",
        metric: "max |T_numeric − T_analytic| (°C)",
        error: max_error,
        tolerance: 0.05,
        passed: max_error <= 0.05,
    }
}

/// Semi-infinite solid under a constant applied surface flux.
///
/// T(x,t) − T_0 = (2q/k)·√(αt/π)·exp(−η²) − (q·x/k)·erfc(η),  η = x/(2√(αt))
fn case_constant_surface_flux() -> VerificationCase {
    let initial_c = 37.0;
    let flux = 1000.0;
    let duration_s = 60.0;
    let conductivity = 0.5;

    let layers = [uniform_layer(0.05, conductivity)];
    let mesh = build_mesh(
        &layers,
        10e-6,
        400e-6,
        1.12,
        BloodProperties {
            temperature_c: initial_c,
            ..BloodProperties::default()
        },
        initial_c,
    );

    let alpha = conductivity / (1000.0 * 4000.0);
    let count = mesh.cell_count();
    let mut state = SolverState::new(mesh, vec![initial_c; count], initial_c);

    state.run_phase(
        Phase {
            duration_s,
            surface: SurfaceCoupling::Flux {
                flux_w_per_m2: flux,
            },
            device: None,
        },
        0.02,
        &NO_DAMAGE,
        |_, _| {},
    );

    let root = (alpha * duration_s).sqrt();
    let mut max_error: f64 = 0.0;
    for (index, cell) in state.mesh.cells.iter().enumerate() {
        let eta = cell.center_m / (2.0 * root);
        let analytic = initial_c
            + (2.0 * flux / conductivity)
                * (root / std::f64::consts::PI.sqrt())
                * (-eta * eta).exp()
            - (flux * cell.center_m / conductivity) * erfc(eta);
        max_error = max_error.max((state.temperature_c[index] - analytic).abs());
    }

    VerificationCase {
        id: "semi-infinite-constant-flux",
        name: "Semi-infinite solid, constant surface flux",
        description:
            "1000 W/m² applied to a homogeneous half-space for 60 s, compared against the closed-form flux solution.",
        reference: "Carslaw HS & Jaeger JC (1959), Conduction of Heat in Solids, §2.9.",
        metric: "max |T_numeric − T_analytic| (°C)",
        error: max_error,
        tolerance: 0.05,
        passed: max_error <= 0.05,
    }
}

/// Steady Pennes equation with perfusion, which decays exponentially with a
/// length scale √(k/W).
///
/// T(x) = T_a + (T_s − T_a)·exp(−x·√(W/k))
fn case_perfusion_steady_state() -> VerificationCase {
    let blood_c = 37.0;
    let surface_c = 45.0;
    let conductivity = 0.5;

    // Choose perfusion so that W = ω·ρ_b·c_b is exactly 5000 W/(m³ K).
    let blood = BloodProperties {
        temperature_c: blood_c,
        density_kg_per_m3: 1000.0,
        specific_heat_j_per_kg_k: 1000.0,
    };
    let perfusion_per_s = 5000.0 / (blood.density_kg_per_m3 * blood.specific_heat_j_per_kg_k);

    let layers = [LayerMaterial {
        thickness_m: 0.1,
        density_kg_per_m3: 1000.0,
        specific_heat_j_per_kg_k: 4000.0,
        conductivity_w_per_m_k: conductivity,
        perfusion_per_s,
        metabolic_w_per_m3: 0.0,
    }];
    let mesh = build_mesh(&layers, 20e-6, 500e-6, 1.10, blood, blood_c);

    let temperature = steady_state(&mesh, surface_c);
    let decay = (5000.0f64 / conductivity).sqrt();

    let mut max_error: f64 = 0.0;
    for (index, cell) in mesh.cells.iter().enumerate() {
        let analytic = blood_c + (surface_c - blood_c) * (-decay * cell.center_m).exp();
        max_error = max_error.max((temperature[index] - analytic).abs());
    }

    VerificationCase {
        id: "perfusion-steady-state",
        name: "Perfused half-space, steady state",
        description:
            "Steady Pennes solution with W = 5000 W/(m³·K), checking that the perfusion sink produces the correct exponential decay length.",
        reference: "Pennes HH (1948), J Appl Physiol 1(2):93-122.",
        metric: "max |T_numeric − T_analytic| (°C)",
        error: max_error,
        tolerance: 0.01,
        passed: max_error <= 0.01,
    }
}

/// Steady conduction through two layers with dissimilar conductivity.
///
/// This is the case that catches an incorrect interface treatment: the exact
/// flux is ΔT / (L₁/k₁ + L₂/k₂), and only a harmonic-mean face conductivity
/// reproduces it. Arithmetic averaging fails here.
fn case_two_layer_interface() -> VerificationCase {
    let surface_c = 45.0;
    let core_c = 37.0;
    let (thickness_1, conductivity_1) = (0.001, 0.2);
    let (thickness_2, conductivity_2) = (0.004, 0.6);

    let layers = [
        uniform_layer(thickness_1, conductivity_1),
        uniform_layer(thickness_2, conductivity_2),
    ];
    let mesh = build_mesh(
        &layers,
        5e-6,
        200e-6,
        1.15,
        BloodProperties {
            temperature_c: core_c,
            ..BloodProperties::default()
        },
        core_c,
    );

    let temperature = steady_state(&mesh, surface_c);

    let resistance = thickness_1 / conductivity_1 + thickness_2 / conductivity_2;
    let flux = (surface_c - core_c) / resistance;
    let interface_c = surface_c - flux * thickness_1 / conductivity_1;

    let mut max_error: f64 = 0.0;
    for (index, cell) in mesh.cells.iter().enumerate() {
        let analytic = if cell.layer_index == 0 {
            surface_c - flux * cell.center_m / conductivity_1
        } else {
            interface_c - flux * (cell.center_m - thickness_1) / conductivity_2
        };
        max_error = max_error.max((temperature[index] - analytic).abs());
    }

    // A finite-volume steady solve with harmonic-mean faces is exact at cell
    // centres, so the tolerance here is essentially round-off.
    VerificationCase {
        id: "two-layer-interface",
        name: "Two-layer slab, steady conduction",
        description:
            "Steady flux across a 1 mm / 4 mm bilayer with a threefold conductivity jump. Verifies that the layer interface conserves heat flux exactly.",
        reference: "Patankar SV (1980), Numerical Heat Transfer and Fluid Flow, §4.2.3.",
        metric: "max |T_numeric − T_analytic| (°C)",
        error: max_error,
        tolerance: 1e-9,
        passed: max_error <= 1e-9,
    }
}

/// Contact-conductance boundary driven to steady state.
///
/// The series network gives q = (T_device − T_core) / (1/h + L/k), and the skin
/// surface must sit exactly one contact-resistance drop below the device.
fn case_contact_conductance_steady_state() -> VerificationCase {
    let device_c = 50.0;
    let core_c = 37.0;
    let conductance = 200.0;
    let thickness = 0.005;
    let conductivity = 0.5;

    let layers = [uniform_layer(thickness, conductivity)];
    let mesh = build_mesh(
        &layers,
        10e-6,
        200e-6,
        1.12,
        BloodProperties {
            temperature_c: core_c,
            ..BloodProperties::default()
        },
        core_c,
    );

    let count = mesh.cell_count();
    let mut state = SolverState::new(mesh, vec![core_c; count], device_c);

    // Ten diffusion time constants is ample to reach steady state.
    state.run_phase(
        Phase {
            duration_s: 3000.0,
            surface: SurfaceCoupling::Conductance {
                conductance,
                external_c: device_c,
            },
            device: None,
        },
        1.0,
        &NO_DAMAGE,
        |_, _| {},
    );

    let flux = (device_c - core_c) / (1.0 / conductance + thickness / conductivity);
    let surface_c = device_c - flux / conductance;

    let mut max_error: f64 = 0.0;
    for (index, cell) in state.mesh.cells.iter().enumerate() {
        let analytic = surface_c - flux * cell.center_m / conductivity;
        max_error = max_error.max((state.temperature_c[index] - analytic).abs());
    }

    VerificationCase {
        id: "contact-conductance-steady-state",
        name: "Contact-conductance boundary, steady state",
        description:
            "A 200 W/(m²·K) contact driven to steady state, verifying the surface temperature sits exactly one contact-resistance drop below the device.",
        reference: "Incropera FP & DeWitt DP, Fundamentals of Heat and Mass Transfer, thermal contact resistance.",
        metric: "max |T_numeric − T_analytic| (°C)",
        error: max_error,
        tolerance: 1e-4,
        passed: max_error <= 1e-4,
    }
}

/// Energy conservation for a device with finite thermal mass.
///
/// Whatever the device gives up must arrive somewhere: stored in tissue,
/// carried away by blood, or lost through the deep boundary.
fn case_energy_conservation() -> VerificationCase {
    let core_c = 37.0;
    let layers = [
        uniform_layer(0.0001, 0.235),
        uniform_layer(0.0015, 0.445),
        uniform_layer(0.02, 0.3),
    ];
    let blood = BloodProperties {
        temperature_c: core_c,
        ..BloodProperties::default()
    };
    let mesh = build_mesh(&layers, 5e-6, 250e-6, 1.15, blood, core_c);

    let initial = steady_state(&mesh, 33.0);
    let mut state = SolverState::new(mesh, initial, 60.0);

    state.run_phase(
        Phase {
            duration_s: 20.0,
            surface: SurfaceCoupling::Device { conductance: 500.0 },
            device: Some(DeviceModel {
                setpoint_c: 60.0,
                areal_heat_capacity_j_per_m2_k: 5000.0,
                control: super::solver::DeviceControl::Passive,
                back_loss_w_per_m2_k: 8.0,
                ambient_c: 22.0,
            }),
        },
        0.01,
        &NO_DAMAGE,
        |_, _| {},
    );

    let residual = state.energy.relative_residual();

    VerificationCase {
        id: "energy-conservation",
        name: "Energy ledger closure",
        description:
            "A passive 60 °C thermal mass on layered tissue for 20 s. Sums every energy pathway and checks the books balance.",
        reference: "Discrete conservation property of the finite-volume formulation.",
        metric: "|residual| / largest pathway",
        error: residual,
        tolerance: 1e-9,
        passed: residual <= 1e-9,
    }
}

pub fn run_verification_suite() -> VerificationSuite {
    let cases = vec![
        case_step_surface_temperature(),
        case_constant_surface_flux(),
        case_perfusion_steady_state(),
        case_two_layer_interface(),
        case_contact_conductance_steady_state(),
        case_energy_conservation(),
    ];

    let passed = cases.iter().all(|case| case.passed);
    let failures = cases.iter().filter(|case| !case.passed).count();

    let summary = if passed {
        format!(
            "All {} verification cases passed against their analytic or conservation references.",
            cases.len()
        )
    } else {
        format!(
            "{} of {} verification cases failed. Simulation output should not be trusted until they pass.",
            failures,
            cases.len()
        )
    };

    VerificationSuite {
        model_version: MODEL_VERSION,
        cases,
        passed,
        summary,
        scope:
            "Verification only: these cases confirm the solver reproduces known solutions of the governing equations. They say nothing about whether those equations predict real tissue response, which requires validation against published experimental data.",
    }
}

// ---------------------------------------------------------------------------
// Mesh and timestep convergence
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConvergenceMetric {
    pub name: &'static str,
    pub unit: &'static str,
    pub coarse: f64,
    pub medium: f64,
    pub fine: f64,
    /// |fine − medium|, relative to the fine value.
    pub relative_change: f64,
    /// Order of accuracy implied by the three grids. Near 2 is expected.
    pub observed_order: Option<f64>,
    /// Richardson-extrapolated estimate of the grid-independent value.
    pub extrapolated: Option<f64>,
    pub tolerance: f64,
    pub converged: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConvergenceReport {
    pub refinement_ratio: f64,
    pub metrics: Vec<ConvergenceMetric>,
    pub converged: bool,
    pub note: String,
}

/// Estimate the observed order and the extrapolated exact value from three
/// systematically refined solutions.
fn richardson(coarse: f64, medium: f64, fine: f64, ratio: f64) -> (Option<f64>, Option<f64>) {
    let coarse_gap = coarse - medium;
    let fine_gap = medium - fine;

    if fine_gap.abs() < 1e-12 || coarse_gap.abs() < 1e-12 {
        return (None, None);
    }
    // Oscillatory convergence makes the order estimate meaningless.
    if coarse_gap / fine_gap <= 0.0 {
        return (None, None);
    }

    let order = (coarse_gap / fine_gap).abs().ln() / ratio.ln();
    if !order.is_finite() || order <= 0.0 {
        return (None, None);
    }

    // f_exact ≈ f_fine + (f_fine − f_medium) / (r^p − 1), and fine_gap is
    // defined as (f_medium − f_fine), hence the subtraction.
    let extrapolated = fine - fine_gap / (ratio.powf(order) - 1.0);
    (Some(order), Some(extrapolated))
}

pub fn convergence_metric(
    name: &'static str,
    unit: &'static str,
    coarse: f64,
    medium: f64,
    fine: f64,
    ratio: f64,
    tolerance: f64,
) -> ConvergenceMetric {
    let scale = fine.abs().max(1e-9);
    let relative_change = (fine - medium).abs() / scale;
    let (observed_order, extrapolated) = richardson(coarse, medium, fine, ratio);

    ConvergenceMetric {
        name,
        unit,
        coarse,
        medium,
        fine,
        relative_change,
        observed_order,
        extrapolated,
        tolerance,
        converged: relative_change <= tolerance,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verification_suite_passes() {
        let suite = run_verification_suite();
        for case in &suite.cases {
            assert!(
                case.passed,
                "verification case '{}' failed: {} = {:.3e} exceeds tolerance {:.3e}",
                case.id, case.metric, case.error, case.tolerance
            );
        }
        assert!(suite.passed);
    }

    #[test]
    fn richardson_recovers_second_order() {
        // Values generated by exact + C·h² with h = 4, 2, 1.
        let exact = 10.0;
        let coarse = exact + 16.0;
        let medium = exact + 4.0;
        let fine = exact + 1.0;

        let (order, extrapolated) = richardson(coarse, medium, fine, 2.0);
        assert!((order.unwrap() - 2.0).abs() < 1e-9);
        assert!((extrapolated.unwrap() - exact).abs() < 1e-9);
    }
}
