mod assist;
mod simulation;

use assist::{
    assist_config_status, extract_protocol_from_text, suggest_protocol_from_text,
    AssistConfigStatus, ExtractProtocolRequest, ExtractProtocolResponse, ProtocolSuggestion,
    SuggestProtocolRequest,
};

use simulation::mechanics::{run_mechanics_simulation, MechanicsResponse};
use simulation::model::{
    DamageModel, DeviceMaterial, InterfaceMaterial, SkinProfile, DAMAGE_MODELS, DEVICE_MATERIALS,
    INTERFACE_MATERIALS, SKIN_PROFILES,
};
use simulation::verification::VerificationSuite;
use simulation::{
    run_heat_simulation, run_validation_suite, SimulationRequest, SimulationResponse,
    ValidationRequest, ValidationSuiteReport,
};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn run_simulation(request: SimulationRequest) -> Result<SimulationResponse, String> {
    run_heat_simulation(request)
}

/// Run the mechanical (pressure/compression/fatigue) solver on pressure contacts.
#[tauri::command]
fn run_mechanics(request: SimulationRequest) -> Result<MechanicsResponse, String> {
    run_mechanics_simulation(request)
}

/// Run the analytic verification suite on demand, so the user can confirm the
/// solver is sound without having to set up an experiment first.
#[tauri::command]
fn verify_solver() -> VerificationSuite {
    simulation::run_verification()
}

/// Experimental heat-validation suite: locked protocols, optional calibration,
/// hold-out comparison. Never returns an experimental pass/fail badge.
#[tauri::command]
fn run_validation(request: ValidationRequest) -> Result<ValidationSuiteReport, String> {
    run_validation_suite(request)
}

/// Whether Azure Foundry / OpenAI assist is configured (never returns secrets).
#[tauri::command]
fn assist_status() -> AssistConfigStatus {
    assist_config_status()
}

/// Map natural language to a structured literature-aligned protocol suggestion.
#[tauri::command]
async fn assist_suggest_protocol(
    request: SuggestProtocolRequest,
) -> Result<Option<ProtocolSuggestion>, String> {
    suggest_protocol_from_text(request).await
}

/// Extract a draft validation manifest from paper or methods text (Azure required).
#[tauri::command]
async fn assist_extract_protocol(
    request: ExtractProtocolRequest,
) -> Result<ExtractProtocolResponse, String> {
    extract_protocol_from_text(request).await
}

/// The tissue profiles, materials and damage kinetics the UI offers, served
/// from the same tables the solver uses so the two cannot drift apart.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ModelCatalog {
    skin_profiles: &'static [SkinProfile],
    device_materials: &'static [DeviceMaterial],
    interface_materials: &'static [InterfaceMaterial],
    damage_models: &'static [DamageModel],
}

#[tauri::command]
fn model_catalog() -> ModelCatalog {
    ModelCatalog {
        skin_profiles: SKIN_PROFILES,
        device_materials: DEVICE_MATERIALS,
        interface_materials: INTERFACE_MATERIALS,
        damage_models: DAMAGE_MODELS,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = dotenvy::dotenv();

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            run_simulation,
            run_mechanics,
            verify_solver,
            run_validation,
            assist_status,
            assist_suggest_protocol,
            assist_extract_protocol,
            model_catalog
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
