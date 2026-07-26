//! Contact-boundary physics.
//!
//! The previous model pinned the skin surface to the device's target
//! temperature, which implicitly assumed perfect contact and an infinitely
//! powerful controller. Everything here exists to replace that with a finite
//! conductance so that contact area, pressure, interface material and device
//! thermal mass actually change the answer.

use serde::Serialize;

use super::model::{DeviceMaterial, InterfaceMaterial};

/// Effective indentation hardness of skin, used by the pressure-dependent
/// contact correlation.
///
/// Skin is orders of magnitude softer than the metals such correlations were
/// developed for. This value is an engineering estimate, and the resulting
/// conductance should be treated as a rough bound rather than a measurement.
const SKIN_MICROHARDNESS_PA: f64 = 2.5e5;

/// Thermal conductivity of the air trapped between asperities.
const AIR_CONDUCTIVITY_W_PER_M_K: f64 = 0.026;

/// Mean absolute asperity slope for the CMY-style correlation. Dimensionless.
const ASPERITY_SLOPE: f64 = 0.1;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactNetwork {
    /// Conductance actually handed to the solver [W/(m² K)].
    pub total_w_per_m2_k: f64,
    /// Conductance of the interface film, when one is present.
    pub interface_film_w_per_m2_k: Option<f64>,
    /// Solid-to-solid asperity conduction, for a pressure-dependent contact.
    pub solid_spot_w_per_m2_k: Option<f64>,
    /// Conduction through the gas trapped in the gap.
    pub gap_w_per_m2_k: Option<f64>,
    pub method: &'static str,
    pub notes: Vec<String>,
}

pub fn contact_radius_m(area_m2: f64) -> f64 {
    (area_m2 / std::f64::consts::PI).max(0.0).sqrt()
}

/// Integral of the complementary error function, ierfc(x) = ∫ₓ^∞ erfc(u) du.
fn ierfc(x: f64) -> f64 {
    (-x * x).exp() / std::f64::consts::PI.sqrt() - x * super::solver::erfc(x)
}

/// Fraction of the one-dimensional temperature rise that survives when the
/// heat source is a disc of finite radius rather than an infinite plane.
///
/// For a uniform flux over a disc of radius `a` on a semi-infinite solid, the
/// rise on the axis is
///
/// ```text
/// ΔT(z,t) = (2q/k)·√(αt)·[ ierfc( z/(2√(αt)) ) − ierfc( √(z²+a²)/(2√(αt)) ) ]
/// ```
///
/// and the infinite-plane limit drops the second term. Their ratio is
/// therefore an exact statement, for this geometry, of how much heat escapes
/// sideways instead of driving the temperature at depth `z`.
///
/// Applying it to a layered, contact-resistance-limited case is an
/// approximation, but it has the right limits: it tends to 1 for a large pad
/// and falls towards 0 for a point contact held long enough.
///
/// Returns a value in (0, 1].
pub fn axial_spreading_factor(
    depth_m: f64,
    thermal_diffusivity: f64,
    elapsed_s: f64,
    contact_radius_m: f64,
) -> f64 {
    if elapsed_s <= 0.0 || contact_radius_m <= 0.0 {
        return 1.0;
    }

    let denominator = 2.0 * (thermal_diffusivity * elapsed_s).sqrt();
    if denominator <= 0.0 {
        return 1.0;
    }

    let axial = ierfc(depth_m / denominator);
    if axial <= 1e-12 {
        return 1.0;
    }

    let radial = ierfc((depth_m * depth_m + contact_radius_m * contact_radius_m).sqrt() / denominator);
    ((axial - radial) / axial).clamp(0.0, 1.0)
}

/// Build the device-to-skin conductance network.
///
/// `override_conductance` short-circuits the estimate entirely, which is the
/// right choice whenever the user has measured the interface.
pub fn contact_network(
    interface: &InterfaceMaterial,
    device: &DeviceMaterial,
    skin_conductivity: f64,
    interface_thickness_m: f64,
    pressure_pa: f64,
    override_conductance: Option<f64>,
) -> ContactNetwork {
    if let Some(value) = override_conductance {
        return ContactNetwork {
            total_w_per_m2_k: value,
            interface_film_w_per_m2_k: None,
            solid_spot_w_per_m2_k: None,
            gap_w_per_m2_k: None,
            method: "user-specified contact conductance",
            notes: vec![
                "Contact conductance was supplied directly; interface material, thickness and pressure did not affect it."
                    .to_string(),
            ],
        };
    }

    let mut notes = Vec::new();

    if interface.pressure_dependent {
        // Two parallel paths across the asperity gap: metal-to-tissue contact
        // at the touching spots, and conduction through the trapped air.
        let harmonic_conductivity = 2.0 * device.conductivity_w_per_m_k * skin_conductivity
            / (device.conductivity_w_per_m_k + skin_conductivity);
        let hardness = SKIN_MICROHARDNESS_PA.min(device.microhardness_pa);
        let roughness_m = interface_thickness_m.max(1e-7);

        let relative_pressure = (pressure_pa / hardness).clamp(0.0, 1.0);
        let solid_spot = 1.25 * harmonic_conductivity * (ASPERITY_SLOPE / roughness_m)
            * relative_pressure.powf(0.95);
        let gap = AIR_CONDUCTIVITY_W_PER_M_K / roughness_m;
        let total = solid_spot + gap;

        notes.push(format!(
            "Dry contact estimated from a Cooper-Mikic-Yovanovich-style correlation at {:.1} kPa \
             against an assumed skin indentation hardness of {:.0} kPa.",
            pressure_pa / 1000.0,
            hardness / 1000.0
        ));
        notes.push(
            "The correlation was developed for metallic contacts. Treat the value as an order-of-magnitude \
             estimate and override it with a measured conductance where one exists."
                .to_string(),
        );

        if relative_pressure >= 1.0 {
            notes.push(
                "Applied pressure meets or exceeds the assumed skin hardness, so the contact is treated as fully conforming."
                    .to_string(),
            );
        }

        return ContactNetwork {
            total_w_per_m2_k: total,
            interface_film_w_per_m2_k: None,
            solid_spot_w_per_m2_k: Some(solid_spot),
            gap_w_per_m2_k: Some(gap),
            method: "pressure-dependent dry contact",
            notes,
        };
    }

    // A conforming film: conductance is simply k/t, and pressure only enters
    // through how much the film is compressed.
    let thickness = interface_thickness_m.max(1e-7);
    let film = interface.conductivity_w_per_m_k / thickness;

    notes.push(format!(
        "{} modelled as a conforming film of {:.0} µm at {:.3} W/(m·K).",
        interface.label,
        thickness * 1e6,
        interface.conductivity_w_per_m_k
    ));

    if pressure_pa > 0.0 {
        notes.push(
            "Applied pressure is recorded but does not change a conforming-film interface; \
             switch to dry contact for a pressure-sensitive estimate."
                .to_string(),
        );
    }

    ContactNetwork {
        total_w_per_m2_k: film,
        interface_film_w_per_m2_k: Some(film),
        solid_spot_w_per_m2_k: None,
        gap_w_per_m2_k: None,
        method: "conforming interface film",
        notes,
    }
}

/// How defensible the one-dimensional assumption is for this contact patch.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DimensionalityCheck {
    pub contact_radius_mm: f64,
    pub penetration_depth_mm: f64,
    /// Fo = α·t / a². Small values mean heat has not yet travelled far enough
    /// laterally for the edges of the contact to matter.
    pub fourier_number: f64,
    /// Fraction of the 1D temperature rise retained at the assessment depth
    /// once finite contact size is accounted for. 1.0 means fully 1D.
    pub spreading_factor: f64,
    pub verdict: &'static str,
    pub guidance: &'static str,
}

pub fn check_dimensionality(
    contact_area_m2: f64,
    thermal_diffusivity: f64,
    duration_s: f64,
    assessment_depth_m: f64,
) -> DimensionalityCheck {
    let radius = contact_radius_m(contact_area_m2);
    let penetration = 2.0 * (thermal_diffusivity * duration_s).sqrt();
    let fourier = if radius > 0.0 {
        thermal_diffusivity * duration_s / (radius * radius)
    } else {
        f64::INFINITY
    };
    let spreading_factor =
        axial_spreading_factor(assessment_depth_m, thermal_diffusivity, duration_s, radius);

    let (verdict, guidance) = if fourier < 0.02 {
        (
            "1D assumption well satisfied",
            "Heat has penetrated far less than the contact radius, so lateral spreading is negligible over this exposure.",
        )
    } else if fourier < 0.25 {
        (
            "1D assumption marginal",
            "Thermal penetration is becoming comparable to the contact radius. The 1D result over-predicts heating; treat the lateral-bound curve as the lower estimate.",
        )
    } else {
        (
            "1D assumption not valid",
            "Heat spreads laterally further than the contact radius over this exposure. A 1D model materially over-predicts temperature here; an axisymmetric or 3D solver is required for a defensible result.",
        )
    };

    DimensionalityCheck {
        contact_radius_mm: radius * 1000.0,
        penetration_depth_mm: penetration * 1000.0,
        fourier_number: fourier,
        spreading_factor,
        verdict,
        guidance,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::simulation::model::{device_material, interface_material};

    #[test]
    fn film_conductance_is_k_over_thickness() {
        let interface = interface_material("hydrogel").unwrap();
        let device = device_material("aluminium-6061").unwrap();
        let network = contact_network(interface, device, 0.4, 250e-6, 0.0, None);

        let expected = interface.conductivity_w_per_m_k / 250e-6;
        assert!((network.total_w_per_m2_k - expected).abs() / expected < 1e-12);
    }

    #[test]
    fn dry_contact_conductance_rises_with_pressure() {
        let interface = interface_material("dry-contact").unwrap();
        let device = device_material("aluminium-6061").unwrap();

        let light = contact_network(interface, device, 0.4, 20e-6, 1_000.0, None);
        let firm = contact_network(interface, device, 0.4, 20e-6, 50_000.0, None);

        assert!(firm.total_w_per_m2_k > light.total_w_per_m2_k);
    }

    #[test]
    fn spreading_factor_approaches_unity_for_a_large_pad() {
        // A 50 mm radius pad over 10 s: heat has moved ~0.07 mm sideways
        // relative to a 50 mm radius, so the 1D answer is essentially intact.
        let factor = axial_spreading_factor(0.0001, 1.2e-7, 10.0, 0.05);
        assert!(factor > 0.999, "expected ~1, got {factor}");
    }

    #[test]
    fn spreading_factor_collapses_for_a_point_contact() {
        // A 0.2 mm radius tip held for 60 s loses most of its heat sideways.
        let factor = axial_spreading_factor(0.0001, 1.2e-7, 60.0, 0.0002);
        assert!(factor < 0.2, "expected strong lateral loss, got {factor}");
    }

    #[test]
    fn spreading_factor_increases_monotonically_with_contact_size() {
        let mut previous = 0.0;
        for radius_mm in [0.1, 0.5, 1.0, 5.0, 25.0] {
            let factor = axial_spreading_factor(0.0001, 1.2e-7, 30.0, radius_mm / 1000.0);
            assert!(
                factor > previous,
                "factor should grow with contact radius: {radius_mm} mm gave {factor}"
            );
            previous = factor;
        }
        assert!(previous <= 1.0);
    }

    #[test]
    fn small_contacts_are_flagged_as_non_1d() {
        // 1 mm^2 patch heated for 30 s: penetration far exceeds the radius.
        let check = check_dimensionality(1e-6, 1.2e-7, 30.0, 0.0001);
        assert_eq!(check.verdict, "1D assumption not valid");
        assert!(check.spreading_factor < 0.5);

        // 25 cm^2 pad for 1 s: comfortably one-dimensional.
        let check = check_dimensionality(2.5e-3, 1.2e-7, 1.0, 0.0001);
        assert_eq!(check.verdict, "1D assumption well satisfied");
        assert!(check.spreading_factor > 0.99);
    }
}
