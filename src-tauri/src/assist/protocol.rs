use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::simulation::model::{
    damage_model, device_material, interface_material, skin_profile, DEFAULT_DAMAGE_MODEL_ID,
    DEFAULT_DEVICE_MATERIAL_ID, DEFAULT_INTERFACE_MATERIAL_ID, DEFAULT_SKIN_PROFILE_ID,
};
use crate::simulation::validation::{CaseAvailability, ValidationCaseManifest};

use super::azure::chat_json;
use super::config::load_azure_config;

const CASE_PMED: &str = include_str!("../../../benchmarks/heat/cases/pmed-forearm-cheps-10s.json");
const CASE_MAYROVITZ: &str =
    include_str!("../../../benchmarks/heat/cases/mayrovitz-forearm-local-42c.json");

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AssistSource {
    Azure,
    Rules,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtocolSuggestion {
    pub case_id: Option<String>,
    pub label: String,
    pub citation: String,
    pub confidence: String,
    pub reason: String,
    pub availability: String,
    pub availability_note: String,
    pub parameters: HashMap<String, f64>,
    pub options: HashMap<String, String>,
    pub unknowns: Vec<String>,
    pub warnings: Vec<String>,
    pub source: AssistSource,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestProtocolRequest {
    pub text: String,
    #[serde(default)]
    pub prefer_azure: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractProtocolRequest {
    pub text: String,
    #[serde(default)]
    pub prefer_azure: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractProtocolResponse {
    pub source: AssistSource,
    pub draft_manifest: Option<ValidationCaseManifest>,
    pub missing_fields: Vec<String>,
    pub unknowns: Vec<String>,
    pub warnings: Vec<String>,
    pub confidence: String,
    pub extraction_notes: String,
}

struct LiteratureKeywordCase {
    id: &'static str,
    label: &'static str,
    keywords: &'static [&'static str],
    manifest_json: &'static str,
}

const LITERATURE_CASES: &[LiteratureKeywordCase] = &[
    LiteratureKeywordCase {
        id: "pmed-forearm-cheps-10s",
        label: "PMED · CHEPS 10 s (45 °C)",
        keywords: &[
            "pmed",
            "cheps",
            "medoc",
            "painmonit",
            "forearm",
            "10s",
            "10 s",
            "45",
            "calibration",
        ],
        manifest_json: CASE_PMED,
    },
    LiteratureKeywordCase {
        id: "mayrovitz-forearm-local-42c",
        label: "Mayrovitz · local heater 42 °C",
        keywords: &[
            "mayrovitz",
            "local heat",
            "42",
            "forearm",
            "aluminium",
            "holdout",
            "hold-out",
            "12 min",
        ],
        manifest_json: CASE_MAYROVITZ,
    },
];

fn score_case(case: &LiteratureKeywordCase, normalized: &str) -> usize {
    let mut score = 0usize;
    for keyword in case.keywords {
        if normalized.contains(keyword) {
            score += if keyword.len() >= 4 { 2 } else { 1 };
        }
    }
    if normalized.contains("forearm") {
        score += 2;
    }
    if normalized.contains("calibrat") && case.id.contains("pmed") {
        score += 1;
    }
    if normalized.contains("hold") && case.id.contains("mayrovitz") {
        score += 1;
    }
    score
}

fn confidence_label(score: usize) -> &'static str {
    if score >= 6 {
        "high"
    } else if score >= 4 {
        "medium"
    } else {
        "low"
    }
}

fn availability_label(value: CaseAvailability) -> &'static str {
    match value {
        CaseAvailability::Ready => "ready",
        CaseAvailability::AwaitingContactSiteSeries => "awaiting_contact_site_series",
        CaseAvailability::ProtocolOnly => "protocol_only",
    }
}

fn manifest_to_suggestion(
    manifest: &ValidationCaseManifest,
    case_id: &str,
    label: &str,
    confidence: &str,
    reason: String,
    source: AssistSource,
) -> ProtocolSuggestion {
    ProtocolSuggestion {
        case_id: Some(case_id.to_string()),
        label: label.to_string(),
        citation: manifest.citation.clone(),
        confidence: confidence.to_string(),
        reason,
        availability: availability_label(manifest.availability).to_string(),
        availability_note: manifest.availability_note.clone(),
        parameters: manifest.protocol.parameters.clone(),
        options: manifest.protocol.options.clone(),
        unknowns: manifest.unknowns.clone(),
        warnings: Vec::new(),
        source,
    }
}

fn suggest_with_rules(text: &str) -> Option<ProtocolSuggestion> {
    let normalized = text.trim().to_lowercase();
    if normalized.is_empty() {
        return None;
    }

    let mut best: Option<&LiteratureKeywordCase> = None;
    let mut best_score = 0usize;
    for case in LITERATURE_CASES {
        let score = score_case(case, &normalized);
        if score > best_score {
            best_score = score;
            best = Some(case);
        }
    }

    let case = best?;
    if best_score < 2 {
        return None;
    }

    let manifest: ValidationCaseManifest =
        serde_json::from_str(case.manifest_json).expect("embedded literature manifest");

    Some(manifest_to_suggestion(
        &manifest,
        case.id,
        case.label,
        confidence_label(best_score),
        format!("Matched {best_score} protocol keyword(s) in: “{}”", text.trim()),
        AssistSource::Rules,
    ))
}

fn catalog_context() -> String {
    let skin_ids: Vec<_> = ["volar-forearm", "dorsal-forearm", "palm", "sole"]
        .into_iter()
        .filter(|id| skin_profile(id).is_some())
        .collect();
    let device_ids: Vec<_> = ["aluminium-6061", "stainless-steel-316", "silicone-elastomer"]
        .into_iter()
        .filter(|id| device_material(id).is_some())
        .collect();
    let interface_ids: Vec<_> = ["dry-contact", "gel-pad", "mineral-oil"]
        .into_iter()
        .filter(|id| interface_material(id).is_some())
        .collect();

    format!(
        "Allowed skinProfileId values: {skin_ids:?}. \
         Allowed deviceMaterialId values: {device_ids:?}. \
         Allowed interfaceMaterialId values: {interface_ids:?}. \
         Allowed deviceControl values: ideal, passive, power_limited. \
         Allowed damageModelId values: henriques-1947. \
         Defaults when unknown: skinProfileId={DEFAULT_SKIN_PROFILE_ID}, \
         deviceMaterialId={DEFAULT_DEVICE_MATERIAL_ID}, \
         interfaceMaterialId={DEFAULT_INTERFACE_MATERIAL_ID}, \
         damageModelId={DEFAULT_DAMAGE_MODEL_ID}."
    )
}

fn literature_context() -> String {
    format!(
        "Known curated cases:\n1) PMED CHEPS 10 s at 45 C on volar forearm (calibration case).\n\
         2) Mayrovitz local aluminium heater 42 C on volar forearm (hold-out case).\n\
         PMED manifest:\n{CASE_PMED}\n\
         Mayrovitz manifest:\n{CASE_MAYROVITZ}"
    )
}

const SUGGEST_SYSTEM_PROMPT: &str = "You are a biomedical experiment protocol mapper for Vide CAE. \
You NEVER predict skin temperature time series and NEVER replace a physics solver. \
Your job is to map user text to structured heat-stimulus parameters that match published protocols when possible. \
Return JSON only with keys: caseId (string|null), label, citation, confidence (high|medium|low), reason, \
availability (ready|awaiting_contact_site_series|protocol_only), availabilityNote, parameters (object of numbers), \
options (object of strings), unknowns (string array), warnings (string array). \
If the text clearly matches a curated case, reuse its parameters exactly and set caseId. \
If information is missing, list it in unknowns and warnings rather than inventing values. \
Do not claim validation against data unless availability is ready.";

const EXTRACT_SYSTEM_PROMPT: &str = "You are a biomedical paper protocol extractor for Vide CAE. \
Extract a draft validation case manifest from the supplied paper text. \
Return JSON only with keys: draftManifest (object matching ValidationCaseManifest fields in camelCase), \
missingFields (string array), unknowns (string array), warnings (string array), \
confidence (high|medium|low), extractionNotes (string). \
Never invent measured temperature series. Set measuredSeriesPath to null unless a CSV path is explicitly given. \
Mark availability as protocol_only unless raw contact-site skin T(t) data is described. \
Use measurementTarget skin_surface for skin under probe, thermode_interface only when explicitly stated.";

fn sanitize_parameters(raw: &HashMap<String, f64>) -> HashMap<String, f64> {
    let mut out = HashMap::new();
    for (key, value) in raw {
        if value.is_finite() {
            out.insert(key.clone(), *value);
        }
    }
    out
}

fn sanitize_options(raw: &HashMap<String, String>) -> HashMap<String, String> {
    let mut out = HashMap::new();
    for (key, value) in raw {
        let trimmed = value.trim().to_string();
        if trimmed.is_empty() {
            continue;
        }
        let validated = match key.as_str() {
            "skinProfileId" => skin_profile(&trimmed)
                .map(|_| trimmed)
                .unwrap_or_else(|| DEFAULT_SKIN_PROFILE_ID.to_string()),
            "deviceMaterialId" => device_material(&trimmed)
                .map(|_| trimmed)
                .unwrap_or_else(|| DEFAULT_DEVICE_MATERIAL_ID.to_string()),
            "interfaceMaterialId" => interface_material(&trimmed)
                .map(|_| trimmed)
                .unwrap_or_else(|| DEFAULT_INTERFACE_MATERIAL_ID.to_string()),
            "damageModelId" => damage_model(&trimmed)
                .map(|_| trimmed)
                .unwrap_or_else(|| DEFAULT_DAMAGE_MODEL_ID.to_string()),
            _ => trimmed,
        };
        out.insert(key.clone(), validated);
    }
    out
}

fn suggestion_from_azure_json(value: Value) -> Result<ProtocolSuggestion, String> {
    let case_id = value
        .get("caseId")
        .and_then(|entry| entry.as_str())
        .map(str::to_string);

    let parameters = value
        .get("parameters")
        .and_then(|entry| serde_json::from_value(entry.clone()).ok())
        .unwrap_or_default();
    let options = value
        .get("options")
        .and_then(|entry| serde_json::from_value(entry.clone()).ok())
        .unwrap_or_default();

    Ok(ProtocolSuggestion {
        case_id,
        label: value
            .get("label")
            .and_then(|entry| entry.as_str())
            .unwrap_or("Suggested protocol")
            .to_string(),
        citation: value
            .get("citation")
            .and_then(|entry| entry.as_str())
            .unwrap_or("")
            .to_string(),
        confidence: value
            .get("confidence")
            .and_then(|entry| entry.as_str())
            .unwrap_or("medium")
            .to_string(),
        reason: value
            .get("reason")
            .and_then(|entry| entry.as_str())
            .unwrap_or("Azure assist mapping")
            .to_string(),
        availability: value
            .get("availability")
            .and_then(|entry| entry.as_str())
            .unwrap_or("protocol_only")
            .to_string(),
        availability_note: value
            .get("availabilityNote")
            .and_then(|entry| entry.as_str())
            .unwrap_or("")
            .to_string(),
        parameters: sanitize_parameters(&parameters),
        options: sanitize_options(&options),
        unknowns: value
            .get("unknowns")
            .and_then(|entry| serde_json::from_value(entry.clone()).ok())
            .unwrap_or_default(),
        warnings: value
            .get("warnings")
            .and_then(|entry| serde_json::from_value(entry.clone()).ok())
            .unwrap_or_default(),
        source: AssistSource::Azure,
    })
}

async fn suggest_with_azure(text: &str) -> Result<ProtocolSuggestion, String> {
    let config = load_azure_config().ok_or_else(|| "Azure assist is not configured".to_string())?;
    let user_prompt = format!(
        "{}\n\n{}\n\nUser text:\n{}",
        catalog_context(),
        literature_context(),
        text.trim()
    );
    let value = chat_json(&config, SUGGEST_SYSTEM_PROMPT, &user_prompt).await?;
    suggestion_from_azure_json(value)
}

pub async fn suggest_protocol_from_text(
    request: SuggestProtocolRequest,
) -> Result<Option<ProtocolSuggestion>, String> {
    let text = request.text.trim();
    if text.is_empty() {
        return Ok(None);
    }

    if request.prefer_azure {
        if let Some(config) = load_azure_config() {
            match suggest_with_azure(text).await {
                Ok(suggestion) => return Ok(Some(suggestion)),
                Err(error) => {
                    eprintln!("Azure assist failed, falling back to rules: {error}");
                    let _ = config;
                }
            }
        }
    }

    Ok(suggest_with_rules(text))
}

async fn extract_with_azure(text: &str) -> Result<ExtractProtocolResponse, String> {
    let config = load_azure_config().ok_or_else(|| "Azure assist is not configured".to_string())?;
    let user_prompt = format!(
        "{}\n\n{}\n\nPaper or methods text:\n{}",
        catalog_context(),
        literature_context(),
        text.trim()
    );
    let value = chat_json(&config, EXTRACT_SYSTEM_PROMPT, &user_prompt).await?;

    let draft_manifest = value
        .get("draftManifest")
        .and_then(|entry| serde_json::from_value::<ValidationCaseManifest>(entry.clone()).ok());

    Ok(ExtractProtocolResponse {
        source: AssistSource::Azure,
        draft_manifest,
        missing_fields: value
            .get("missingFields")
            .and_then(|entry| serde_json::from_value(entry.clone()).ok())
            .unwrap_or_default(),
        unknowns: value
            .get("unknowns")
            .and_then(|entry| serde_json::from_value(entry.clone()).ok())
            .unwrap_or_default(),
        warnings: value
            .get("warnings")
            .and_then(|entry| serde_json::from_value(entry.clone()).ok())
            .unwrap_or_default(),
        confidence: value
            .get("confidence")
            .and_then(|entry| entry.as_str())
            .unwrap_or("medium")
            .to_string(),
        extraction_notes: value
            .get("extractionNotes")
            .and_then(|entry| entry.as_str())
            .unwrap_or("Azure extraction")
            .to_string(),
    })
}

pub async fn extract_protocol_from_text(
    request: ExtractProtocolRequest,
) -> Result<ExtractProtocolResponse, String> {
    let text = request.text.trim();
    if text.is_empty() {
        return Err("Paper text is empty".to_string());
    }

    if request.prefer_azure {
        if let Some(_) = load_azure_config() {
            match extract_with_azure(text).await {
                Ok(response) => return Ok(response),
                Err(error) => eprintln!("Azure extraction failed: {error}"),
            }
        }
    }

    Err(
        "Azure assist is not configured. Set VIDE_AZURE_OPENAI_* environment variables to extract protocols from paper text."
            .to_string(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rules_match_pmed_phrase() {
        let suggestion = suggest_with_rules("PMED CHEPS 45 C forearm 10 s").expect("match");
        assert_eq!(suggestion.case_id.as_deref(), Some("pmed-forearm-cheps-10s"));
        assert_eq!(suggestion.source, AssistSource::Rules);
        assert!(suggestion.parameters.contains_key("temperatureC"));
    }

    #[test]
    fn rules_reject_empty_phrase() {
        assert!(suggest_with_rules("hello world").is_none());
    }
}
