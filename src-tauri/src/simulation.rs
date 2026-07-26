use ndarray::Array1;
use serde::{Deserialize, Serialize};

const BODY_TEMP_C: f64 = 37.0;
const GAS_CONSTANT_J_PER_MOL_K: f64 = 8.314;
// Henriques-style Arrhenius thermal injury coefficients commonly used in
// skin-burn modeling. Model outputs require experimental validation and are
// not clinical advice.
const ARRHENIUS_A: f64 = 3.1e98;
const ARRHENIUS_EA_J_PER_MOL: f64 = 6.28e5;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationRequest {
    pub contacts: Vec<SimulationContact>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationContact {
    pub id: String,
    pub label: String,
    pub stimulus_type: String,
    pub parameters: std::collections::HashMap<String, f64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationResponse {
    pub model: ModelMetadata,
    pub contacts: Vec<ContactSimulationResult>,
    pub unsupported_contacts: Vec<UnsupportedContact>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelMetadata {
    pub name: &'static str,
    pub scope: &'static str,
    pub citation: &'static str,
    pub disclaimer: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactSimulationResult {
    pub contact_point_id: String,
    pub label: String,
    pub surface_temperature_c: f64,
    pub duration_s: f64,
    pub peak_surface_temperature_c: f64,
    pub peak_basal_temperature_c: f64,
    pub time_to_44c_s: Option<f64>,
    pub arrhenius_damage_omega: f64,
    pub risk_classification: &'static str,
    pub series: Vec<ThermalSample>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThermalSample {
    pub time_s: f64,
    pub surface_temperature_c: f64,
    pub basal_temperature_c: f64,
    pub damage_omega: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnsupportedContact {
    pub contact_point_id: String,
    pub label: String,
    pub stimulus_type: String,
    pub reason: &'static str,
}

#[derive(Clone, Copy)]
struct TissueLayer {
    density: f64,
    specific_heat: f64,
    conductivity: f64,
    perfusion_per_s: f64,
}

fn tissue_at_depth(depth_m: f64) -> TissueLayer {
    // 0–0.10 mm epidermis, 0.10–1.50 mm dermis, then hypodermis.
    // Values are representative literature-derived properties, intended as
    // configurable defaults rather than patient-specific tissue parameters.
    if depth_m < 0.000_10 {
        TissueLayer {
            density: 1200.0,
            specific_heat: 3590.0,
            conductivity: 0.235,
            perfusion_per_s: 0.0,
        }
    } else if depth_m < 0.001_50 {
        TissueLayer {
            density: 1200.0,
            specific_heat: 3300.0,
            conductivity: 0.445,
            perfusion_per_s: 0.0016,
        }
    } else {
        TissueLayer {
            density: 1000.0,
            specific_heat: 2670.0,
            conductivity: 0.185,
            perfusion_per_s: 0.0010,
        }
    }
}

fn damage_rate(temp_c: f64) -> f64 {
    let temp_k = temp_c + 273.15;
    ARRHENIUS_A * (-ARRHENIUS_EA_J_PER_MOL / (GAS_CONSTANT_J_PER_MOL_K * temp_k)).exp()
}

fn risk_classification(omega: f64) -> &'static str {
    if omega < 0.1 {
        "below model threshold"
    } else if omega < 1.0 {
        "model threshold approaching"
    } else {
        "model thermal injury threshold exceeded"
    }
}

fn simulate_heat(contact: &SimulationContact) -> Result<ContactSimulationResult, String> {
    let surface_temperature_c = *contact
        .parameters
        .get("temperatureC")
        .ok_or_else(|| "Heat stimulus is missing temperatureC.".to_string())?;
    let duration_s = *contact
        .parameters
        .get("durationS")
        .ok_or_else(|| "Heat stimulus is missing durationS.".to_string())?;

    if !(20.0..=100.0).contains(&surface_temperature_c) {
        return Err("Heat target temperature must be between 20 and 100 °C.".to_string());
    }
    if !(0.1..=600.0).contains(&duration_s) {
        return Err("Heat duration must be between 0.1 and 600 seconds.".to_string());
    }

    // Explicit 1D finite-difference grid. dt satisfies the conservative
    // stability limit for the smallest thermal diffusivity in this stack.
    const DEPTH_M: f64 = 0.006;
    const DX_M: f64 = 0.000_05;
    const DT_S: f64 = 0.005;
    const SAMPLE_INTERVAL_S: f64 = 0.25;
    const BLOOD_DENSITY: f64 = 1060.0;
    const BLOOD_SPECIFIC_HEAT: f64 = 3770.0;

    let node_count = (DEPTH_M / DX_M) as usize + 1;
    let basal_index = (0.000_10 / DX_M).round() as usize;
    let mut temperature = Array1::from_elem(node_count, BODY_TEMP_C);
    let mut next = temperature.clone();
    let mut omega = 0.0;
    let mut elapsed_s = 0.0;
    let mut next_sample_s = 0.0;
    let mut peak_surface = BODY_TEMP_C;
    let mut peak_basal = BODY_TEMP_C;
    let mut time_to_44c = None;
    let mut series = Vec::new();

    while elapsed_s <= duration_s + f64::EPSILON {
        temperature[0] = surface_temperature_c;
        temperature[node_count - 1] = BODY_TEMP_C;

        let basal_temp = temperature[basal_index];
        omega += damage_rate(basal_temp) * DT_S;

        if basal_temp >= 44.0 && time_to_44c.is_none() {
            time_to_44c = Some(elapsed_s);
        }
        peak_surface = peak_surface.max(temperature[0]);
        peak_basal = peak_basal.max(basal_temp);

        if elapsed_s + f64::EPSILON >= next_sample_s || elapsed_s >= duration_s {
            series.push(ThermalSample {
                time_s: elapsed_s,
                surface_temperature_c: temperature[0],
                basal_temperature_c: basal_temp,
                damage_omega: omega,
            });
            next_sample_s += SAMPLE_INTERVAL_S;
        }

        if elapsed_s >= duration_s {
            break;
        }

        for index in 1..(node_count - 1) {
            let depth = index as f64 * DX_M;
            let layer = tissue_at_depth(depth);
            let alpha = layer.conductivity / (layer.density * layer.specific_heat);
            let conduction = alpha
                * (temperature[index + 1] - 2.0 * temperature[index] + temperature[index - 1])
                / (DX_M * DX_M);
            let perfusion = (BLOOD_DENSITY * BLOOD_SPECIFIC_HEAT * layer.perfusion_per_s
                / (layer.density * layer.specific_heat))
                * (BODY_TEMP_C - temperature[index]);
            next[index] = temperature[index] + DT_S * (conduction + perfusion);
        }

        next[0] = surface_temperature_c;
        next[node_count - 1] = BODY_TEMP_C;
        std::mem::swap(&mut temperature, &mut next);
        elapsed_s += DT_S;
    }

    Ok(ContactSimulationResult {
        contact_point_id: contact.id.clone(),
        label: contact.label.clone(),
        surface_temperature_c,
        duration_s,
        peak_surface_temperature_c: peak_surface,
        peak_basal_temperature_c: peak_basal,
        time_to_44c_s: time_to_44c,
        arrhenius_damage_omega: omega,
        risk_classification: risk_classification(omega),
        series,
    })
}

pub fn run_heat_simulation(request: SimulationRequest) -> Result<SimulationResponse, String> {
    let mut contacts = Vec::new();
    let mut unsupported_contacts = Vec::new();

    for contact in &request.contacts {
        if contact.stimulus_type == "heat" {
            contacts.push(simulate_heat(contact)?);
        } else {
            unsupported_contacts.push(UnsupportedContact {
                contact_point_id: contact.id.clone(),
                label: contact.label.clone(),
                stimulus_type: contact.stimulus_type.clone(),
                reason: "Phase 3 currently implements the heat model only.",
            });
        }
    }

    Ok(SimulationResponse {
        model: ModelMetadata {
            name: "1D layered Pennes bioheat + Arrhenius thermal damage",
            scope: "Heat contacts only; independent contact sites; fixed skin material defaults.",
            citation: "Pennes HH (1948), Analysis of tissue and arterial blood temperatures; Henriques FC (1947), Studies of thermal injury.",
            disclaimer: "Research prototype model only. Not clinically validated, patient-specific, or medical advice.",
        },
        contacts,
        unsupported_contacts,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn heat_contact(temperature_c: f64, duration_s: f64) -> SimulationContact {
        let mut parameters = HashMap::new();
        parameters.insert("temperatureC".to_string(), temperature_c);
        parameters.insert("durationS".to_string(), duration_s);

        SimulationContact {
            id: "cp-1".to_string(),
            label: "CP-1".to_string(),
            stimulus_type: "heat".to_string(),
            parameters,
        }
    }

    #[test]
    fn contact_heat_elevates_basal_temperature() {
        let result = simulate_heat(&heat_contact(60.0, 10.0)).expect("valid heat input");

        assert!(result.peak_surface_temperature_c >= 60.0);
        assert!(result.peak_basal_temperature_c > BODY_TEMP_C);
        assert!(!result.series.is_empty());
    }

    #[test]
    fn unsupported_stimuli_are_reported_not_simulated() {
        let response = run_heat_simulation(SimulationRequest {
            contacts: vec![SimulationContact {
                id: "cp-cold".to_string(),
                label: "CP-cold".to_string(),
                stimulus_type: "cold".to_string(),
                parameters: HashMap::new(),
            }],
        })
        .expect("request is valid");

        assert!(response.contacts.is_empty());
        assert_eq!(response.unsupported_contacts.len(), 1);
    }
}
