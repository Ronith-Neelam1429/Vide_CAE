//! AI analysis of Proof Lab paper ↔ Vide comparison reports.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::azure::chat_json;
use super::config::load_azure_config;
use super::protocol::AssistSource;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeProofLabRequest {
    /// Optional precomputed report JSON. When omitted, a fresh blind run is executed.
    #[serde(default)]
    pub report: Option<Value>,
    #[serde(default = "default_prefer_azure")]
    pub prefer_azure: bool,
}

fn default_prefer_azure() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProofLabCaseBrief {
    pub case_id: String,
    pub headline: String,
    pub agreement: String,
    pub highlights: Vec<String>,
    pub concerns: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProofLabAnalysis {
    pub source: AssistSource,
    pub headline: String,
    pub summary: String,
    pub case_briefs: Vec<ProofLabCaseBrief>,
    pub recommended_reads: Vec<String>,
    pub caveats: Vec<String>,
}

const ANALYZE_SYSTEM_PROMPT: &str = "You are a scientific validation analyst for Vide CAE Proof Lab. \
You interpret paper↔Vide comparisons for engineers — do NOT restate numbers already visible in metric cards or protocol tables. \
Each case payload includes protocolMatch.matched (bool) and mismatches[]. \
When protocolMatch.matched is false: agreement MUST be protocol-mismatch. \
Explain in plain language that the sidebar differs from the study protocol and a fair accuracy test requires matching first. \
Do NOT call the model divergent or broken when protocols mismatch — the gap reflects different experiments. \
When protocolMatch.matched is true: agreement may be close|mixed|divergent based on model fit quality only. \
Offer one sentence of judgment (why the gap might exist, what to inspect next) — not a numeric recap. \
Never invent numbers. Never claim clinical pass/fail. \
Return JSON only with keys: headline (string), summary (string), caseBriefs (array of objects with \
caseId, headline, agreement one of protocol-mismatch|close|mixed|divergent|transfer-check, highlights string[], concerns string[]), \
recommendedReads (string[]), caveats (string[]).";

fn protocol_matched(case: &Value) -> bool {
    case.get("protocolMatch")
        .and_then(|entry| entry.get("matched"))
        .and_then(|entry| entry.as_bool())
        .unwrap_or(false)
}

fn mismatch_interpretation(case: &Value) -> String {
    let mismatches = case
        .get("protocolMatch")
        .and_then(|entry| entry.get("mismatches"))
        .and_then(|entry| entry.as_array());

    let Some(mismatches) = mismatches else {
        return "Sidebar settings differ from the published protocol — match the study before judging model accuracy.".into();
    };

    if mismatches.is_empty() {
        return "Sidebar settings differ from the published protocol — match the study before judging model accuracy.".into();
    }

    let mut parts = Vec::new();
    for item in mismatches {
        let label = item
            .get("label")
            .and_then(|entry| entry.as_str())
            .unwrap_or("setting");
        let key = item.get("key").and_then(|entry| entry.as_str()).unwrap_or("");
        let paper = item.get("paper").and_then(|entry| entry.as_f64());
        let yours = item.get("yours").and_then(|entry| entry.as_f64());
        if key == "durationS" {
            if let (Some(p), Some(y)) = (paper, yours) {
                let ratio = if y > 0.0 { p / y } else { f64::NAN };
                if ratio.is_finite() && ratio > 1.5 {
                    parts.push(format!(
                        "The study ran {:.0}× longer than your current hold — duration dominates any temperature curve difference.",
                        ratio
                    ));
                    continue;
                }
            }
        }
        if let (Some(p), Some(y)) = (paper, yours) {
            parts.push(format!(
                "{label} differs (yours {y:.1} vs study {p:.1}) — align this before treating residuals as model error."
            ));
        }
    }

    if parts.is_empty() {
        "Sidebar settings differ from the published protocol — match the study before judging model accuracy.".into()
    } else {
        parts.join(" ")
    }
}

fn matched_accuracy_interpretation(case: &Value) -> String {
    let rmse = case
        .get("windows")
        .and_then(|entry| entry.as_array())
        .and_then(|windows| windows.first())
        .and_then(|window| window.get("rmseC"))
        .and_then(|entry| entry.as_f64());

    let unknowns = case
        .get("unknowns")
        .and_then(|entry| entry.as_array())
        .and_then(|items| items.first())
        .and_then(|entry| entry.as_str())
        .unwrap_or("sparse published checkpoints");

    match rmse {
        Some(r) if r <= 1.0 => format!(
            "With protocols aligned, the model tracks published checkpoints closely — inspect {unknowns} if you need finer shape validation."
        ),
        Some(r) if r <= 3.0 => format!(
            "Protocols match but a {:.1} °C typical gap remains — the largest drift may be at early transient or post-removal windows given {unknowns}.",
            r
        ),
        Some(r) => format!(
            "Protocols match yet residuals reach {:.1} °C typical gap — worth checking measurement target alignment ({unknowns}) before recalibrating physics.",
            r
        ),
        None => "Protocols align — review checkpoint tables for where the curve diverges.".into(),
    }
}

fn rules_analysis(payload: &Value) -> ProofLabAnalysis {
    let mut briefs = Vec::new();
    let mut mismatch_count = 0usize;
    let mut matched_count = 0usize;

    if let Some(cases) = payload.get("cases").and_then(|entry| entry.as_array()) {
        for case in cases {
            let case_id = case
                .get("caseId")
                .and_then(|entry| entry.as_str())
                .unwrap_or("unknown")
                .to_string();
            let title = case
                .get("title")
                .and_then(|entry| entry.as_str())
                .map(str::to_string)
                .unwrap_or_else(|| case_id.clone());

            let matched = protocol_matched(case);
            let mut highlights = Vec::new();
            let mut concerns = Vec::new();

            if matched {
                matched_count += 1;
                let interpretation = matched_accuracy_interpretation(case);
                highlights.push(interpretation);

                let rmse = case
                    .get("windows")
                    .and_then(|entry| entry.as_array())
                    .and_then(|windows| windows.first())
                    .and_then(|window| window.get("rmseC"))
                    .and_then(|entry| entry.as_f64())
                    .unwrap_or(f64::NAN);

                let agreement = if rmse.is_finite() && rmse <= 1.0 {
                    "close"
                } else if rmse.is_finite() && rmse <= 3.0 {
                    "mixed"
                } else {
                    "divergent"
                };

                if agreement == "divergent" {
                    concerns.push(
                        "Residuals remain large even with matched protocol — focus on measurement target and sparse checkpoints, not sidebar settings.".into(),
                    );
                }

                briefs.push(ProofLabCaseBrief {
                    case_id,
                    headline: format!("{title}: model accuracy review (protocol matched)"),
                    agreement: agreement.into(),
                    highlights,
                    concerns,
                });
            } else {
                mismatch_count += 1;
                highlights.push(mismatch_interpretation(case));
                concerns.push(
                    "RMSE/MAE on this run reflect protocol differences, not model failure — use Match protocol, then re-run.".into(),
                );
                briefs.push(ProofLabCaseBrief {
                    case_id,
                    headline: format!("{title}: protocols differ — not a fair accuracy test yet"),
                    agreement: "protocol-mismatch".into(),
                    highlights,
                    concerns,
                });
            }
        }
    }

    if let Some(cross) = payload
        .get("crossValidationCases")
        .and_then(|entry| entry.as_array())
    {
        for case in cross {
            let case_id = case
                .get("caseId")
                .and_then(|entry| entry.as_str())
                .unwrap_or("cross")
                .to_string();
            let title = case
                .get("title")
                .and_then(|entry| entry.as_str())
                .map(str::to_string)
                .unwrap_or_else(|| case_id.clone());

            briefs.push(ProofLabCaseBrief {
                case_id,
                headline: format!("{title}: independent transfer check"),
                agreement: "transfer-check".into(),
                highlights: vec![
                    "This compares Vide's production equations to a different published model family — large RMSE is expected and informative, not a sidebar calibration failure.".into(),
                ],
                concerns: case
                    .get("caveats")
                    .and_then(|entry| serde_json::from_value(entry.clone()).ok())
                    .unwrap_or_default(),
            });
        }
    }

    let headline = if mismatch_count > 0 && matched_count == 0 {
        "Proof Lab: align study protocols before judging model accuracy".into()
    } else if mismatch_count > 0 {
        "Proof Lab: some comparisons are protocol mismatches — match settings for fair accuracy tests".into()
    } else {
        "Proof Lab: protocol-matched comparisons ready for accuracy review".into()
    };

    let summary = if mismatch_count > 0 {
        "Focus on protocol alignment first — error metrics beside mismatched studies describe different experiments, not model quality. Match a study's protocol, re-run, then read accuracy briefs.".into()
    } else {
        "Protocols match the selected studies. Briefs below interpret model fit — they deliberately avoid repeating numbers already shown in the cards.".into()
    };

    ProofLabAnalysis {
        source: AssistSource::Rules,
        headline,
        summary,
        case_briefs: briefs,
        recommended_reads: vec![
            "Use Match protocol for any study showing Protocol mismatch.".into(),
            "Open Metric detail only when you need checkpoint-level numbers.".into(),
        ],
        caveats: vec![
            "Heat cases simulate from your sidebar; published curves are compared afterward.".into(),
            "Sparse paper checkpoints constrain claims about full T(t) shape.".into(),
        ],
    }
}

fn analysis_from_azure_json(value: Value) -> Result<ProofLabAnalysis, String> {
    let case_briefs = value
        .get("caseBriefs")
        .cloned()
        .map(serde_json::from_value)
        .transpose()
        .map_err(|error| format!("Invalid caseBriefs: {error}"))?
        .unwrap_or_default();

    Ok(ProofLabAnalysis {
        source: AssistSource::Azure,
        headline: value
            .get("headline")
            .and_then(|entry| entry.as_str())
            .unwrap_or("Proof Lab AI comparison")
            .to_string(),
        summary: value
            .get("summary")
            .and_then(|entry| entry.as_str())
            .unwrap_or("")
            .to_string(),
        case_briefs,
        recommended_reads: value
            .get("recommendedReads")
            .and_then(|entry| serde_json::from_value(entry.clone()).ok())
            .unwrap_or_default(),
        caveats: value
            .get("caveats")
            .and_then(|entry| serde_json::from_value(entry.clone()).ok())
            .unwrap_or_default(),
    })
}

async fn analyze_with_azure(payload: &Value) -> Result<ProofLabAnalysis, String> {
    let config = load_azure_config().ok_or_else(|| "Azure assist is not configured".to_string())?;
    let user_prompt = format!(
        "Analyze this Proof Lab payload. Do not restate RMSE/MAE/temperature/duration numbers from cards. \
Focus on protocolMatch status and interpretive judgment.\n\n{}",
        serde_json::to_string_pretty(payload).unwrap_or_else(|_| "{}".into())
    );
    let value = chat_json(&config, ANALYZE_SYSTEM_PROMPT, &user_prompt).await?;
    analysis_from_azure_json(value)
}

fn resolve_payload(request: &AnalyzeProofLabRequest) -> Result<Value, String> {
    if let Some(report) = &request.report {
        if report.get("cases").is_some() {
            return Ok(report.clone());
        }
    }
    Err(
        "Proof Lab analysis requires a completed report payload from the frontend.".into(),
    )
}

pub async fn analyze_proof_lab_report(
    request: AnalyzeProofLabRequest,
) -> Result<ProofLabAnalysis, String> {
    let payload = resolve_payload(&request)?;

    if request.prefer_azure {
        if load_azure_config().is_some() {
            match analyze_with_azure(&payload).await {
                Ok(analysis) => return Ok(analysis),
                Err(error) => eprintln!("Azure proof-lab analysis failed: {error}"),
            }
        }
    }

    Ok(rules_analysis(&payload))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::simulation::proof_lab::{
        contact_from_protocol, proof_lab_analysis_payload, run_proof_lab, ProofLabCaseManifest,
        ProofLabRequest,
    };
    use crate::simulation::SolverSettings;

    const MAYROVITZ_PROTOCOL: &str =
        include_str!("../../../benchmarks/proof-lab/mayrovitz-2020-forearm-42c/protocol.json");

    fn mayrovitz_request() -> ProofLabRequest {
        let manifest: ProofLabCaseManifest = serde_json::from_str(MAYROVITZ_PROTOCOL).unwrap();
        ProofLabRequest {
            contact: Some(contact_from_protocol(&manifest)),
            case_ids: vec![manifest.id.clone()],
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
    fn rules_analysis_emits_briefs() {
        let report = run_proof_lab(mayrovitz_request()).expect("report");
        let mut payload = proof_lab_analysis_payload(&report);
        if let Some(cases) = payload.get_mut("cases").and_then(|c| c.as_array_mut()) {
            for case in cases {
                case.as_object_mut().map(|obj| {
                    obj.insert(
                        "protocolMatch".into(),
                        serde_json::json!({"matched": true, "mismatches": []}),
                    );
                });
            }
        }
        let analysis = rules_analysis(&payload);
        assert!(!analysis.case_briefs.is_empty());
        assert!(!analysis.headline.is_empty());
    }
}
