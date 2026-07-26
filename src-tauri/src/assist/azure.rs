use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::config::AzureOpenAiConfig;

#[derive(Debug, Serialize)]
struct ResponsesRequest {
    model: String,
    input: Vec<InputMessage>,
    text: TextConfig,
}

#[derive(Debug, Serialize)]
struct InputMessage {
    role: &'static str,
    content: Vec<InputContent>,
}

#[derive(Debug, Serialize)]
struct InputContent {
    #[serde(rename = "type")]
    content_type: &'static str,
    text: String,
}

#[derive(Debug, Deserialize)]
struct ResponsesApiResponse {
    #[serde(default)]
    output_text: String,
    #[serde(default)]
    output: Vec<OutputItem>,
}

#[derive(Debug, Deserialize)]
struct OutputItem {
    #[serde(default)]
    content: Vec<OutputContent>,
}

#[derive(Debug, Deserialize)]
struct OutputContent {
    #[serde(rename = "type")]
    content_type: String,
    #[serde(default)]
    text: String,
}

#[derive(Debug, Serialize)]
struct TextConfig {
    format: JsonObjectFormat,
}

#[derive(Debug, Serialize)]
struct JsonObjectFormat {
    #[serde(rename = "type")]
    format_type: &'static str,
}

fn responses_url(endpoint: &str) -> String {
    let endpoint = endpoint.trim_end_matches('/');
    if endpoint.ends_with("/responses") {
        endpoint.to_string()
    } else if endpoint.ends_with("/openai/v1") {
        format!("{endpoint}/responses")
    } else {
        format!("{endpoint}/openai/v1/responses")
    }
}

fn response_text(response: ResponsesApiResponse) -> Result<String, String> {
    if !response.output_text.trim().is_empty() {
        return Ok(response.output_text);
    }

    let text = response
        .output
        .iter()
        .flat_map(|item| item.content.iter())
        .filter(|content| content.content_type == "output_text")
        .map(|content| content.text.as_str())
        .collect::<Vec<_>>()
        .join("");

    if text.trim().is_empty() {
        Err("Azure Responses API returned no output_text".to_string())
    } else {
        Ok(text)
    }
}

pub async fn chat_json(
    config: &AzureOpenAiConfig,
    system_prompt: &str,
    user_prompt: &str,
) -> Result<Value, String> {
    let url = responses_url(&config.endpoint);

    let mut headers = HeaderMap::new();
    headers.insert(
        "api-key",
        HeaderValue::from_str(&config.api_key)
            .map_err(|error| format!("Invalid Azure API key header: {error}"))?,
    );
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

    let body = ResponsesRequest {
        model: config.deployment.clone(),
        input: vec![
            InputMessage {
                role: "system",
                content: vec![InputContent {
                    content_type: "input_text",
                    text: system_prompt.to_string(),
                }],
            },
            InputMessage {
                role: "user",
                content: vec![InputContent {
                    content_type: "input_text",
                    text: user_prompt.to_string(),
                }],
            },
        ],
        text: TextConfig {
            format: JsonObjectFormat {
                format_type: "json_object",
            },
        },
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|error| format!("Failed to create HTTP client: {error}"))?;

    let response = client
        .post(url)
        .headers(headers)
        .json(&body)
        .send()
        .await
        .map_err(|error| format!("Azure request failed: {error}"))?;

    let status = response.status();
    let raw = response
        .text()
        .await
        .map_err(|error| format!("Failed to read Azure response: {error}"))?;

    if !status.is_success() {
        return Err(format!("Azure returned HTTP {status}: {raw}"));
    }

    let parsed: ResponsesApiResponse = serde_json::from_str(&raw)
        .map_err(|error| format!("Invalid Azure Responses API JSON: {error}; body={raw}"))?;
    let content = response_text(parsed)?;

    serde_json::from_str(&content)
        .map_err(|error| format!("Azure message was not valid JSON: {error}; content={content}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn responses_request_serializes() {
        let body = ResponsesRequest {
            model: "gpt-5-mini".to_string(),
            input: vec![InputMessage {
                role: "system",
                content: vec![InputContent {
                    content_type: "input_text",
                    text: "test".to_string(),
                }],
            }],
            text: TextConfig {
                format: JsonObjectFormat {
                    format_type: "json_object",
                },
            },
        };
        let json = serde_json::to_string(&body).expect("serialize");
        assert!(json.contains("json_object"));
        assert!(json.contains("gpt-5-mini"));
    }

    #[test]
    fn preserves_full_responses_endpoint() {
        assert_eq!(
            responses_url("https://vide.services.ai.azure.com/openai/v1/responses"),
            "https://vide.services.ai.azure.com/openai/v1/responses"
        );
    }

    #[test]
    fn parses_output_text_fallback() {
        let parsed = ResponsesApiResponse {
            output_text: String::new(),
            output: vec![OutputItem {
                content: vec![OutputContent {
                    content_type: "output_text".to_string(),
                    text: "{\"ready\":true}".to_string(),
                }],
            }],
        };
        assert_eq!(response_text(parsed).expect("output"), "{\"ready\":true}");
    }
}
