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
You compare published experiment quantities to Vide simulation outputs. \
Be precise, quantitative, and honest about disagreement. Never invent numbers not present in the payload. \
Never claim clinical pass/fail. Prefer experiment-relevant checkpoints (baseline, end temperature, ΔT, \
pressure at specific durations, rheobase/chronaxie, pulse thresholds) over vague average-error language, \
while still mentioning RMSE/MAE when useful. \
Return JSON only with keys: headline (string), summary (string), caseBriefs (array of objects with \
caseId, headline, agreement one of close|mixed|divergent, highlights string[], concerns string[]), \
recommendedReads (string[]), caveats (string[]).";

fn rules_analysis(payload: &Value) -> ProofLabAnalysis {
    let mut briefs = Vec::new();
    let mut divergent = 0usize;
    let mut close = 0usize;

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

            let metrics = case
                .get("experimentMetrics")
                .and_then(|entry| entry.as_array())
                .cloned()
                .unwrap_or_default();

            let mut highlights = Vec::new();
            let mut concerns = Vec::new();
            let mut worst_abs = 0.0_f64;

            for metric in &metrics {
                let label = metric
                    .get("label")
                    .and_then(|entry| entry.as_str())
                    .unwrap_or("metric");
                let unit = metric
                    .get("unit")
                    .and_then(|entry| entry.as_str())
                    .unwrap_or("");
                let paper = metric.get("paperValue").and_then(|entry| entry.as_f64());
                let vide = metric.get("videValue").and_then(|entry| entry.as_f64());
                let abs_err = metric
                    .get("absoluteError")
                    .and_then(|entry| entry.as_f64())
                    .or_else(|| match (paper, vide) {
                        (Some(p), Some(v)) => Some(v - p),
                        _ => None,
                    });
                let category = metric
                    .get("category")
                    .and_then(|entry| entry.as_str())
                    .unwrap_or("");

                if category == "summary" {
                    if let Some(value) = vide {
                        if label.to_ascii_lowercase().contains("rmse") {
                            highlights.push(format!("RMSE {value:.3} {unit}"));
                        }
                    }
                    continue;
                }

                if let (Some(p), Some(v), Some(err)) = (paper, vide, abs_err) {
                    worst_abs = worst_abs.max(err.abs());
                    let line = format!("{label}: paper {p:.3} {unit} vs Vide {v:.3} {unit} (Δ {err:+.3})");
                    if err.abs() <= f64::max(0.5, 0.05 * p.abs()) {
                        highlights.push(line);
                    } else {
                        concerns.push(line);
                    }
                }
            }

            let agreement = if concerns.is_empty() && !highlights.is_empty() {
                close += 1;
                "close"
            } else if concerns.len() > highlights.len() {
                divergent += 1;
                "divergent"
            } else {
                "mixed"
            };

            if highlights.is_empty() {
                highlights.push("Compared locked protocol outputs to published checkpoints.".into());
            }

            briefs.push(ProofLabCaseBrief {
                case_id,
                headline: format!("{title}: {agreement} paper↔Vide agreement"),
                agreement: agreement.into(),
                highlights,
                concerns,
            });

            let _ = worst_abs;
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
            let rmse = case.get("rmse").and_then(|entry| entry.as_f64()).unwrap_or(f64::NAN);
            let unit = case
                .get("experimentMetrics")
                .and_then(|entry| entry.as_array())
                .and_then(|metrics| metrics.first())
                .and_then(|metric| metric.get("unit"))
                .and_then(|entry| entry.as_str())
                .unwrap_or("");

            let mut highlights = Vec::new();
            let mut concerns = Vec::new();
            if let Some(metrics) = case
                .get("experimentMetrics")
                .and_then(|entry| entry.as_array())
            {
                for metric in metrics.iter().take(8) {
                    let label = metric
                        .get("label")
                        .and_then(|entry| entry.as_str())
                        .unwrap_or("metric");
                    let m_unit = metric
                        .get("unit")
                        .and_then(|entry| entry.as_str())
                        .unwrap_or(unit);
                    let paper = metric.get("paperValue").and_then(|entry| entry.as_f64());
                    let vide = metric.get("videValue").and_then(|entry| entry.as_f64());
                    let category = metric
                        .get("category")
                        .and_then(|entry| entry.as_str())
                        .unwrap_or("");
                    if category == "summary" {
                        continue;
                    }
                    if let (Some(p), Some(v)) = (paper, vide) {
                        let err = v - p;
                        let line = format!("{label}: paper {p:.3} {m_unit} vs Vide {v:.3} {m_unit} (Δ {err:+.3})");
                        if err.abs() / p.abs().max(1.0e-9) > 0.25 {
                            concerns.push(line);
                        } else {
                            highlights.push(line);
                        }
                    }
                }
            }
            if rmse.is_finite() {
                concerns.push(format!("Aggregate RMSE {rmse:.3} {unit} (transfer check)"));
            }
            divergent += 1;
            briefs.push(ProofLabCaseBrief {
                case_id,
                headline: format!("{title}: transfer check exposes model family differences"),
                agreement: "divergent".into(),
                highlights,
                concerns,
            });
        }
    }

    let headline = if divergent > close {
        "Proof Lab shows mixed-to-divergent paper↔Vide agreement on experiment checkpoints"
            .into()
    } else {
        "Proof Lab checkpoint comparison complete — review paper vs Vide side-by-side".into()
    };

    ProofLabAnalysis {
        source: AssistSource::Rules,
        headline,
        summary: "Deterministic analysis of experiment-relevant checkpoints (baseline/end temperatures, ΔT, duration thresholds, strength-duration parameters) plus RMSE/MAE. Azure was unavailable or disabled, so this is a rules fallback — not a clinical verdict.".into(),
        case_briefs: briefs,
        recommended_reads: vec![
            "Read every key data point table — not only RMSE.".into(),
            "Treat mechanical/electrical transfer checks as cross-model tests, not calibration targets.".into(),
        ],
        caveats: vec![
            "Blind heat cases never exposed measured series to the solver.".into(),
            "Sparse paper checkpoints (e.g. Mayrovitz/Petrofsky) constrain what can be claimed about T(t) shape.".into(),
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
        "Analyze this Proof Lab paper↔Vide comparison payload. Focus on experiment-specific quantities and direct mismatches.\n\n{}",
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
            contact: contact_from_protocol(&manifest),
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
        let payload = proof_lab_analysis_payload(&report);
        let analysis = rules_analysis(&payload);
        assert!(!analysis.case_briefs.is_empty());
        assert!(!analysis.headline.is_empty());
    }
}
