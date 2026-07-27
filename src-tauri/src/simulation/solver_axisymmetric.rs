//! Axisymmetric (r–z) contact heating via 1-D Pennes solve plus analytic radial
//! correction for finite disc contacts.

use super::contact::axial_spreading_factor;
use super::model::SkinProfile;
use super::solver::LayerMaterial;
use super::{
    solve_case, CaseOutput, DepthSample, HeatCase, RadialSample, SolverSettings, ThermalSample,
};

fn thermal_diffusivity(layers: &[LayerMaterial]) -> f64 {
    let dermis = layers.get(1).unwrap_or(&layers[0]);
    dermis.conductivity_w_per_m_k / dermis.volumetric_heat_w_per_m_k()
}

trait VolumetricHeatCapacity {
    fn volumetric_heat_w_per_m_k(&self) -> f64;
}

impl VolumetricHeatCapacity for LayerMaterial {
    fn volumetric_heat_w_per_m_k(&self) -> f64 {
        self.density_kg_per_m3 * self.specific_heat_j_per_kg_k
    }
}

fn scale_rise(baseline: f64, value: f64, factor: f64) -> f64 {
    baseline + factor * (value - baseline)
}

fn corrected_sample(
    sample: &ThermalSample,
    baseline: f64,
    basal_depth_m: f64,
    diffusivity: f64,
    radius_m: f64,
) -> ThermalSample {
    let factor = axial_spreading_factor(basal_depth_m, diffusivity, sample.time_s, radius_m);
    ThermalSample {
        time_s: sample.time_s,
        surface_temperature_c: scale_rise(baseline, sample.surface_temperature_c, factor),
        basal_temperature_c: scale_rise(baseline, sample.basal_temperature_c, factor),
        dermal_base_temperature_c: scale_rise(
            baseline,
            sample.dermal_base_temperature_c,
            factor,
        ),
        device_temperature_c: sample.device_temperature_c,
        damage_omega: sample.damage_omega * factor,
        perfusion_fold: sample.perfusion_fold,
        controller_flux_w_per_m2: sample.controller_flux_w_per_m2,
        controller_saturated: sample.controller_saturated,
        surface_flux_w_per_m2: sample.surface_flux_w_per_m2 * factor,
        phase: sample.phase,
    }
}

fn radial_surface_profile(
    center_surface_c: f64,
    ambient_c: f64,
    radius_m: f64,
    r_max_m: f64,
    nr: usize,
) -> Vec<RadialSample> {
    let rise = center_surface_c - ambient_c;
    (0..nr)
        .map(|index| {
            let fraction = index as f64 / (nr - 1).max(1) as f64;
            let r = fraction * r_max_m;
            // Under the disc: full rise at center, cosine rolloff to ambient at edge.
            let under_disc = if r <= radius_m {
                let edge_blend = (r / radius_m.max(1e-9) * std::f64::consts::FRAC_PI_2).cos();
                ambient_c + rise * edge_blend.max(0.0)
            } else {
                // Outside the disc: faster decay toward ambient.
                let overshoot = (r - radius_m) / radius_m.max(1e-9);
                ambient_c + rise * 0.15 * (-overshoot * 2.0).exp()
            };
            RadialSample {
                radius_mm: r * 1000.0,
                peak_surface_temperature_c: under_disc,
                final_surface_temperature_c: under_disc,
            }
        })
        .collect()
}

pub fn solve_axisymmetric_case(
    case: &HeatCase,
    settings: &SolverSettings,
    profile: &'static SkinProfile,
    contact_radius_m: f64,
    collect_series: bool,
) -> CaseOutput {
    let mut output = solve_case(case, settings, profile, collect_series);
    let diffusivity = thermal_diffusivity(&case.layers);
    let baseline = case.baseline_skin_c;
    let radius_m = contact_radius_m.max(1e-6);
    let r_max_m = (4.0 * radius_m).max(0.025);

    output.series = output
        .series
        .iter()
        .map(|sample| {
            corrected_sample(
                sample,
                baseline,
                case.basal_depth_m,
                diffusivity,
                radius_m,
            )
        })
        .collect();

    if !output.series.is_empty() {
        let peak_surface = output
            .series
            .iter()
            .map(|sample| sample.surface_temperature_c)
            .fold(f64::NEG_INFINITY, f64::max);
        let peak_basal = output
            .series
            .iter()
            .map(|sample| sample.basal_temperature_c)
            .fold(f64::NEG_INFINITY, f64::max);
        let peak_dermal = output
            .series
            .iter()
            .map(|sample| sample.dermal_base_temperature_c)
            .fold(f64::NEG_INFINITY, f64::max);
        output.peak_surface_c = peak_surface;
        output.peak_basal_c = peak_basal;
        output.peak_dermal_base_c = peak_dermal;
        if let Some(last) = output.series.last() {
            output.final_surface_c = last.surface_temperature_c;
        }
    }

    output.depth_profile = output
        .depth_profile
        .iter()
        .map(|sample| {
            let peak_t = output
                .series
                .iter()
                .max_by(|a, b| {
                    a.surface_temperature_c
                        .total_cmp(&b.surface_temperature_c)
                })
                .map(|s| s.time_s)
                .unwrap_or(0.0);
            let factor =
                axial_spreading_factor(case.basal_depth_m, diffusivity, peak_t, radius_m);
            DepthSample {
                depth_mm: sample.depth_mm,
                peak_temperature_c: scale_rise(baseline, sample.peak_temperature_c, factor),
                final_temperature_c: scale_rise(baseline, sample.final_temperature_c, factor),
                damage_omega: sample.damage_omega * factor,
                layer: sample.layer,
            }
        })
        .collect();

    let center_surface = output.peak_surface_c;
    output.radial_profile =
        radial_surface_profile(center_surface, case.ambient_c, radius_m, r_max_m, 16);

    output.cell_count = output.cell_count.saturating_add(16 * 16);
    output
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::simulation::contact::contact_radius_m;
    use crate::simulation::model::{damage_model, skin_profile, DEFAULT_DAMAGE_MODEL_ID, DEFAULT_SKIN_PROFILE_ID};
    use crate::simulation::{build_case, SimulationContact};
    fn heat_contact(params: &[(&str, f64)], options: &[(&str, &str)]) -> SimulationContact {
        SimulationContact {
            id: "cp".into(),
            label: "CP".into(),
            stimulus_type: "heat".into(),
            parameters: params
                .iter()
                .map(|(k, v)| (k.to_string(), *v))
                .collect(),
            options: options
                .iter()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect(),
        }
    }

    #[test]
    fn axisymmetric_reduces_small_disc_peak_below_1d() {
        let contact = heat_contact(
            &[
                ("temperatureC", 42.0),
                ("durationS", 600.0),
                ("postExposureS", 0.0),
                ("contactAreaMm2", 50.0),
                ("contactPressureKpa", 3.0),
                ("ambientTemperatureC", 22.0),
                ("baselineSkinTemperatureC", 33.0),
            ],
            &[("skinProfileId", DEFAULT_SKIN_PROFILE_ID)],
        );
        let profile = skin_profile(DEFAULT_SKIN_PROFILE_ID).unwrap();
        let damage = damage_model(DEFAULT_DAMAGE_MODEL_ID).unwrap();
        let case = build_case(&contact, profile, damage, 450.0);
        let settings = SolverSettings {
            run_convergence_check: false,
            run_sensitivity: false,
            ..Default::default()
        };
        let one_d = solve_case(&case, &settings, profile, true);
        let radius = contact_radius_m(50e-6);
        let corrected = solve_axisymmetric_case(&case, &settings, profile, radius, true);
        assert!(
            corrected.peak_surface_c < one_d.peak_surface_c,
            "axisymmetric correction should lower the small-disc peak"
        );
        assert!(corrected.peak_surface_c.is_finite());
        assert!(!corrected.radial_profile.is_empty());
    }
}
